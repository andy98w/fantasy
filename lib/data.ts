import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { createPool } from "./postgres";
import { snapshotSchema, type Snapshot } from "./schema";
import demo from "./demo.json";
import { mergeLiveScores } from "./live-scores";
import { applyResultCorrections } from "./result-corrections";
const globalDb = globalThis as unknown as { pool?: Pool };
export type DataResult = {
  snapshot: Snapshot | null;
  error: string | null;
  syncFailure: string | null;
};
export async function loadLeague(): Promise<DataResult> {
  if ((process.env.DATA_MODE ?? "demo") === "demo") {
    return {
      snapshot: snapshotSchema.parse(demo),
      error: null,
      syncFailure: null,
    };
  }
  try {
    let value: unknown;
    let liveScores: unknown;
    let syncFailure: string | null = null;
    if (process.env.DATABASE_URL) {
      const pool = (globalDb.pool ??= createPool({
        connectionString: process.env.DATABASE_URL,
        max: 3,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      }));
      const params = [
        Number(process.env.ESPN_LEAGUE_ID ?? 1834203755),
        Number(process.env.ESPN_SEASON ?? 2027),
      ];
      const result = await pool.query(
        "SELECT payload FROM league_snapshots WHERE league_id=$1 AND season=$2 ORDER BY captured_at DESC,id DESC LIMIT 1",
        params,
      );
      value = result.rows[0]?.payload;
      try {
        liveScores = (await pool.query("SELECT payload FROM league_live_scores WHERE league_id=$1 AND season=$2", params)).rows[0]?.payload;
      } catch { /* Optional during migration or a live-score outage; full imports still work. */ }
      try {
        const status = await pool.query(
          "SELECT succeeded,message FROM sync_runs WHERE league_id=$1 AND season=$2 ORDER BY finished_at DESC,id DESC LIMIT 1",
          params,
        );
        if (status.rows[0]?.succeeded === false)
          syncFailure = status.rows[0].message;
      } catch {
        // Optional diagnostics must not hide an already loaded valid snapshot.
        syncFailure = "Sync status unavailable. Showing the saved import.";
        console.error("Sync-status lookup failed; keeping the saved league snapshot.");
      }
    } else {
      const file = path.resolve(
        /* turbopackIgnore: true */ process.env.SNAPSHOT_PATH ??
          "data/league.json",
      );
      value = JSON.parse(
        await readFile(/* turbopackIgnore: true */ file, "utf8"),
      );
      try {
        const status = JSON.parse(
          await readFile(
            /* turbopackIgnore: true */ path.join(
              path.dirname(file),
              "sync-status.json",
            ),
            "utf8",
          ),
        );
        if (status.succeeded === false) syncFailure = status.message;
      } catch {
        /* missing optional status does not hide a validated snapshot */
      }
    }
    const snapshot = snapshotSchema.parse(value);
    if (
      snapshot.mode !== "live" ||
      snapshot.league.id !== Number(process.env.ESPN_LEAGUE_ID ?? 1834203755) ||
      snapshot.league.season !== Number(process.env.ESPN_SEASON ?? 2027)
    )
      throw new Error("Snapshot identity mismatch");
    return { snapshot: applyResultCorrections(mergeLiveScores(snapshot, liveScores)), error: null, syncFailure };
  } catch {
    return {
      snapshot: null,
      error:
        "Your league has not been imported, or its latest snapshot could not be read. Check the connection setup and run a successful sync.",
      syncFailure: null,
    };
  }
}

/** Read retained daily captures without exposing raw ESPN payloads. */
export async function loadPowerHistory(current: Snapshot, request: import("./mcp/power-history").HistoryRequest) {
  const { extractPowerHistory } = await import("./mcp/power-history");
  if (current.mode === "demo") return extractPowerHistory([current], current, request, "demo");
  if (!process.env.DATABASE_URL) {
    const file = path.resolve(/* turbopackIgnore: true */ process.env.SNAPSHOT_PATH ?? "data/league.json");
    const raw = JSON.parse(await readFile(/* turbopackIgnore: true */ file, "utf8"));
    return extractPowerHistory([raw], current, request, "local");
  }
  const pool = globalDb.pool ??= createPool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  const { retainedPowerSnapshots } = await import("./mcp/history-store");
  const rows = await retainedPowerSnapshots(pool, current.league.id, current.league.season, request.from, request.to);
  return extractPowerHistory(rows.rows.map(row => row.payload), current, request, "database");
}
