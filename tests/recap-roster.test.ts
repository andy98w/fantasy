import test from "node:test";
import assert from "node:assert/strict";
import demo from "../lib/demo.json";
import { snapshotSchema } from "../lib/schema";
import { recapRosterFromSnapshot } from "../lib/recap-roster";

test("recap capture requires the same league, season and explicit lineup date", () => {
  const current = snapshotSchema.parse(demo), date = "2026-11-11";
  const saved = { ...current, syncedAt: "2026-11-12T08:00:00Z", forecastSchedule: {
    lineupDate: date, lineups: [{ teamId: current.teams[0].id, entries: [{ playerId: current.players[0].id, slot: "PG" }] }],
    windows: [], games: [], pairs: [], slots: ["PG"],
  } };
  const recap = recapRosterFromSnapshot(saved, current, date)!;
  assert.equal(recap.capturedAt, saved.syncedAt);
  assert.deepEqual(recap.players.map(p => p.id), [current.players[0].id]);
  assert.equal(recap.lineups[0].entries[0].slot, "PG");
  for (const invalid of [undefined, {},
    { ...saved, league: { ...saved.league, id: saved.league.id + 1 } },
    { ...saved, league: { ...saved.league, season: saved.league.season - 1 } },
    { ...saved, forecastSchedule: { ...saved.forecastSchedule, lineupDate: "2026-11-12" } },
    { ...saved, forecastSchedule: { ...saved.forecastSchedule, lineups: undefined } },
  ]) assert.equal(recapRosterFromSnapshot(invalid, current, date), undefined);
});
