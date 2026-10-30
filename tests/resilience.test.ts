import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createPool } from "../lib/postgres";

test("idle PostgreSQL errors are handled without exposing connection details", async () => {
  const pool = createPool({ connectionString: "postgres://fake:secret@example.invalid/test" });
  const messages: unknown[][] = [];
  const original = console.error;
  console.error = (...args) => { messages.push(args); };
  try {
    assert.doesNotThrow(() => pool.emit("error", new Error("secret connection details")));
    assert.equal(messages.length, 1);
    assert.doesNotMatch(JSON.stringify(messages), /secret|example.invalid/);
  } finally { console.error = original; await pool.end(); }
});

test("a failed optional sync-status lookup preserves validated league data", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", `
    import { readFileSync } from 'node:fs';
    import assert from 'node:assert/strict';
    const demo = JSON.parse(readFileSync('lib/demo.json', 'utf8'));
    demo.mode = 'live';
    process.env.DATA_MODE = 'live';
    process.env.DATABASE_URL = 'test-only';
    process.env.ESPN_LEAGUE_ID = String(demo.league.id);
    process.env.ESPN_SEASON = String(demo.league.season);
    globalThis.pool = { query: async sql => {
      if (sql.includes('sync_runs')) throw new Error('sensitive connection details');
      return {rows: [{payload: demo}]};
    }};
    const mod = await import('./lib/data.ts');
    const {loadLeague} = mod.default ?? mod;
    const result = await loadLeague();
    assert.equal(result.snapshot.league.id, demo.league.id);
    assert.equal(result.error, null);
    assert.match(result.syncFailure, /status unavailable/);
    demo.league.id += 1;
    assert.equal((await loadLeague()).snapshot, null);
  `], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /sensitive connection details/);
});
