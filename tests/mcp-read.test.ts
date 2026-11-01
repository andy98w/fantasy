import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import { teamRating } from "../lib/analysis";
import { extractPowerHistory } from "../lib/mcp/power-history";
import { dateInput, gameStat, inDateRange } from "../lib/mcp/queries";
import { createScoreboardLoader } from "../lib/mcp/scoreboard-loader";
import demo from "../lib/demo.json";
import board from "./fixtures/nba-scoreboard.json";

test("history uses historical rosters, includes IR and never fills absent dates or leagues", () => {
  const old = snapshotSchema.parse(structuredClone(demo));
  old.syncedAt = "2026-10-30T22:00:00Z";
  const current = structuredClone(old); current.syncedAt = "2026-11-01T19:00:00Z";
  const player = current.players.find(p => p.teamId !== null)!;
  const id = player.teamId!; player.slot = "IR"; player.power = 90;
  const request = { kind: "team" as const, id, from: "2026-10-29", to: "2026-11-01" };
  const wrongLeague = structuredClone(old); wrongLeague.league.id++;
  const history = extractPowerHistory([old, current, wrongLeague, {}], current, request, "database");
  assert.equal(history.skippedSnapshots, 2);
  assert.deepEqual(history.points.map(p => p.date), ["2026-10-30", "2026-11-01"]);
  assert.equal(history.points[0].power, teamRating(old.players.filter(p => p.teamId === id)).score);
  assert.equal(history.points[1].power, teamRating(current.players.filter(p => p.teamId === id)).score);
  assert.ok(history.points[1].rosterIds!.includes(player.id));
  assert.equal(history.points[0].power, history.points[1].power);
  const previous = { ...old, powerHistory: [{ date: "2026-10-29", capturedAt: "2026-10-30T01:00:00Z", ratings: { [player.id]: 45 }, model: { version: "old" } }] };
  const players = extractPowerHistory([previous, current], current, { ...request, kind: "player", id: player.id }, "local");
  assert.equal(players.points[0].power, 45);
  assert.equal(players.points[0].model.version, "old");
  assert.equal(players.points.at(-1)!.power, 90);
});

test("date ranges use Pacific dates across DST; category stats use ratios and null for no attempts", () => {
  assert.equal(dateInput.safeParse("2026-02-30").success, false);
  assert.equal(dateInput.safeParse("2028-02-29").success, true);
  assert.equal(inDateRange("2026-11-01T06:59:00Z", "2026-10-31", "2026-10-31"), true);
  assert.equal(inDateRange("2026-11-01T09:30:00Z", "2026-11-01", "2026-11-01"), true);
  assert.equal(gameStat({ "fieldGoalsMade-fieldGoalsAttempted": "9-10" }, "FG%"), .9);
  assert.equal(gameStat({ "freeThrowsMade-freeThrowsAttempted": "0/0" }, "FT%"), null);
  assert.equal(gameStat({ "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "3-8" }, "3PM"), 3);
  assert.equal(gameStat({ points: "—" }, "PTS"), null);
});

test("dated scoreboard coalesces, deduplicates adjacent feeds, and marks stale/error data", async () => {
  let calls = 0, failed = false, now = Date.parse("2026-10-29T22:00:00Z");
  const loader = createScoreboardLoader(async () => { calls++; if (failed) throw new Error("offline"); return Response.json(board); }, () => now);
  const [a,b] = await Promise.all([loader("2026-10-29"), loader("2026-10-29")]);
  assert.equal(calls, 2); assert.deepEqual(a,b); assert.ok(a.games.length > 0);
  assert.equal(new Set(a.games.map(g => g.id)).size, a.games.length);
  failed = true; now += 21000;
  const stale = await loader("2026-10-29"); assert.equal(stale.status, "stale"); assert.equal(stale.fetchedAt, a.fetchedAt);
  now += 901000; assert.equal((await loader("2026-10-29")).status, "error");
  await assert.rejects(loader("2026-02-30"));
});
