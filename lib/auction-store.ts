import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { createPool } from "./postgres";
import { nextListing, type AuctionListing, type AuctionMutation } from "./auction";

export const auctionDDL = `CREATE TABLE IF NOT EXISTS auction_listings (
  scope TEXT NOT NULL, player_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
  note TEXT NOT NULL, active INTEGER NOT NULL, version INTEGER NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY (scope, player_id)
);`;
const columns = 'player_id AS "playerId", team_id AS "teamId", note, active, version, updated_at AS "updatedAt"';
const decode = (row: Record<string, unknown>): AuctionListing => ({ ...row, active: Boolean(row.active) } as AuctionListing);
export class LocalAuctionStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(auctionDDL);
  }
  close() { this.db.close(); }
  list(scope: string): AuctionListing[] {
    return this.db.prepare(`SELECT ${columns} FROM auction_listings WHERE scope=? ORDER BY updated_at DESC, player_id`).all(scope).map(decode);
  }
  mutate(scope: string, input: AuctionMutation): AuctionListing {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const raw = this.db.prepare(`SELECT ${columns} FROM auction_listings WHERE scope=? AND player_id=?`).get(scope, input.playerId);
      const row = nextListing(raw ? decode(raw) : undefined, input);
      this.db.prepare(`INSERT INTO auction_listings VALUES(?,?,?,?,?,?,?) ON CONFLICT(scope,player_id) DO UPDATE SET team_id=excluded.team_id,note=excluded.note,active=excluded.active,version=excluded.version,updated_at=excluded.updated_at`)
        .run(scope, row.playerId, row.teamId, row.note, Number(row.active), row.version, row.updatedAt);
      this.db.exec("COMMIT"); return row;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
export class PostgresAuctionStore {
  private initialized?: Promise<unknown>;
  constructor(private pool: Pool) {}
  private ready() { return this.initialized ??= this.pool.query(auctionDDL).catch(error => { this.initialized = undefined; throw error; }); }
  async list(scope: string): Promise<AuctionListing[]> {
    await this.ready();
    return (await this.pool.query(`SELECT ${columns} FROM auction_listings WHERE scope=$1 ORDER BY updated_at DESC, player_id`, [scope])).rows.map(decode);
  }
  async mutate(scope: string, input: AuctionMutation): Promise<AuctionListing> {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`auction:${scope}:${input.playerId}`]);
      const raw = (await client.query(`SELECT ${columns} FROM auction_listings WHERE scope=$1 AND player_id=$2`, [scope, input.playerId])).rows[0];
      const row = nextListing(raw ? decode(raw) : undefined, input);
      await client.query(`INSERT INTO auction_listings VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(scope,player_id) DO UPDATE SET team_id=excluded.team_id,note=excluded.note,active=excluded.active,version=excluded.version,updated_at=excluded.updated_at`,
        [scope, row.playerId, row.teamId, row.note, Number(row.active), row.version, row.updatedAt]);
      await client.query("COMMIT"); return row;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
const globalStore = globalThis as unknown as { auctionStore?: LocalAuctionStore | PostgresAuctionStore };
export function auctionStore() {
  if (!globalStore.auctionStore) {
    if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production" && !process.env.BATTLE_DB_PATH)
      throw new Error("Configure durable storage before enabling listings.");
    globalStore.auctionStore = process.env.DATABASE_URL
      ? new PostgresAuctionStore(createPool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 10000 }))
      : new LocalAuctionStore(path.resolve(/* turbopackIgnore: true */ process.env.BATTLE_DB_PATH ?? "data/trade-battles.sqlite"));
  }
  return globalStore.auctionStore;
}
