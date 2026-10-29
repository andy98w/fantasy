// Server storage only. SQLite persists local development; deployed instances share PostgreSQL.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { elo, type BattleMode, type BattleRating, type BattleVote, type VoteResult } from "./trade-battles";

export class VoteConflict extends Error { readonly code = "VOTE_CONFLICT"; }
export const battleDDL = `
CREATE TABLE IF NOT EXISTS battle_ratings (
  scope TEXT NOT NULL, mode TEXT NOT NULL, entry_id TEXT NOT NULL,
  rating DOUBLE PRECISION NOT NULL DEFAULT 1000,
  votes INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, mode, entry_id)
);
CREATE TABLE IF NOT EXISTS battle_votes (
  scope TEXT NOT NULL, request_id TEXT NOT NULL, mode TEXT NOT NULL,
  left_id TEXT NOT NULL, right_id TEXT NOT NULL, winner_id TEXT NOT NULL,
  result TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (scope, request_id)
);`;
type StoredVote = { mode: string; left_id: string; right_id: string; winner_id: string; result: string };
function replay(row: StoredVote, vote: BattleVote): VoteResult {
  if (row.mode !== vote.mode || row.left_id !== vote.leftId || row.right_id !== vote.rightId || row.winner_id !== vote.winnerId)
    throw new VoteConflict("This vote was already submitted differently.");
  return JSON.parse(row.result);
}
function resultFor(vote: BattleVote, winner: number, loser: number): VoteResult {
  const next = elo(winner, loser);
  return { winnerId: vote.winnerId, delta: next.delta, winnerRating: next.winner, loserRating: next.loser };
}
export class LocalBattleStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(battleDDL);
  }
  close() { this.db.close(); }
  ratings(scope: string, mode: BattleMode): BattleRating[] {
    return this.db.prepare('SELECT entry_id AS "entryId", rating, votes, wins FROM battle_ratings WHERE scope=? AND mode=?')
      .all(scope, mode) as unknown as BattleRating[];
  }
  vote(scope: string, vote: BattleVote): VoteResult {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.db.prepare("SELECT * FROM battle_votes WHERE scope=? AND request_id=?").get(scope, vote.requestId) as StoredVote | undefined;
      if (old) { const result = replay(old, vote); this.db.exec("COMMIT"); return result; }
      const loserId = vote.winnerId === vote.leftId ? vote.rightId : vote.leftId;
      for (const id of [vote.winnerId, loserId]) this.db.prepare("INSERT INTO battle_ratings(scope,mode,entry_id) VALUES(?,?,?) ON CONFLICT DO NOTHING").run(scope, vote.mode, id);
      const rating = (id: string) => Number(this.db.prepare("SELECT rating FROM battle_ratings WHERE scope=? AND mode=? AND entry_id=?").get(scope, vote.mode, id)!.rating);
      const result = resultFor(vote, rating(vote.winnerId), rating(loserId));
      const update = this.db.prepare("UPDATE battle_ratings SET rating=?,votes=votes+1,wins=wins+? WHERE scope=? AND mode=? AND entry_id=?");
      update.run(result.winnerRating, 1, scope, vote.mode, vote.winnerId);
      update.run(result.loserRating, 0, scope, vote.mode, loserId);
      this.db.prepare("INSERT INTO battle_votes VALUES(?,?,?,?,?,?,?,?)").run(scope, vote.requestId, vote.mode, vote.leftId, vote.rightId, vote.winnerId, JSON.stringify(result), new Date().toISOString());
      this.db.exec("COMMIT");
      return result;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
export class PostgresBattleStore {
  private initialized?: Promise<unknown>;
  constructor(private pool: Pool) {}
  private ready() {
    return this.initialized ??= this.pool.query(battleDDL).catch(error => { this.initialized = undefined; throw error; });
  }
  async ratings(scope: string, mode: BattleMode): Promise<BattleRating[]> {
    await this.ready();
    return (await this.pool.query('SELECT entry_id AS "entryId", rating, votes, wins FROM battle_ratings WHERE scope=$1 AND mode=$2', [scope, mode])).rows;
  }
  async vote(scope: string, vote: BattleVote): Promise<VoteResult> {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize rating updates across instances, including request-id retries across modes.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [scope]);
      const old = (await client.query("SELECT * FROM battle_votes WHERE scope=$1 AND request_id=$2", [scope, vote.requestId])).rows[0];
      if (old) { const result = replay(old, vote); await client.query("COMMIT"); return result; }
      const loserId = vote.winnerId === vote.leftId ? vote.rightId : vote.leftId;
      for (const id of [vote.winnerId, loserId]) await client.query("INSERT INTO battle_ratings(scope,mode,entry_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [scope, vote.mode, id]);
      const rows = (await client.query("SELECT entry_id,rating FROM battle_ratings WHERE scope=$1 AND mode=$2 AND entry_id=ANY($3::text[])", [scope, vote.mode, [vote.winnerId, loserId]])).rows;
      const result = resultFor(vote, rows.find(r => r.entry_id === vote.winnerId).rating, rows.find(r => r.entry_id === loserId).rating);
      for (const [id, rating, win] of [[vote.winnerId, result.winnerRating, 1], [loserId, result.loserRating, 0]])
        await client.query("UPDATE battle_ratings SET rating=$1,votes=votes+1,wins=wins+$2 WHERE scope=$3 AND mode=$4 AND entry_id=$5", [rating, win, scope, vote.mode, id]);
      await client.query("INSERT INTO battle_votes VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [scope, vote.requestId, vote.mode, vote.leftId, vote.rightId, vote.winnerId, JSON.stringify(result), new Date().toISOString()]);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
const globalStore = globalThis as unknown as { battleStore?: LocalBattleStore | PostgresBattleStore };
export function battleStore() {
  if (!globalStore.battleStore) {
    if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production" && !process.env.BATTLE_DB_PATH)
      throw new Error("Configure durable battle storage before enabling production voting.");
    globalStore.battleStore = process.env.DATABASE_URL
      ? new PostgresBattleStore(new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 10000 }))
      : new LocalBattleStore(path.resolve(/* turbopackIgnore: true */ process.env.BATTLE_DB_PATH ?? "data/trade-battles.sqlite"));
  }
  return globalStore.battleStore;
}
