import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import { matchupPlayers, sortMatchupPlayers, todayMatchupPlayers, matchupGameLabel, matchupPlayerGroups, matchupPlayerDay } from "../lib/matchup-players";
import type { TodayData, NbaGame } from "../lib/nba";
import demo from "../lib/demo.json";

const date = "2026-11-02";
const game: NbaGame = { id: "today", startsAt: "2026-11-03T00:00:00Z", state: "live", detail: "4:20 - 3rd",
  home: { id: "1", abbrev: "NYK", name: "Knicks", score: 70, logo: null },
  away: { id: "2", abbrev: "WAS", name: "Wizards", score: 68, logo: null } };

test("daily view keeps the last played slate through empty days and delayed tips, then switches globally", () => {
  const snapshot = snapshotSchema.parse(demo), matchup = snapshot.matchups[0];
  const player = { ...snapshot.players[0], teamId: matchup.home.teamId, nbaTeam: "NYK" };
  const previous = { date: "2026-11-01", fetchedAt: null, status: "ready" as const,
    games: [{ ...game, id: "previous", startsAt: "2026-11-02T01:00:00Z", state: "final" as const }],
    performances: [{ playerId: player.id, gameId: "previous", minutes: 30, stats: { PTS: 25 } }] };
  const morning: TodayData = { date, fetchedAt: null, status: "ready", games: [], performerDay: previous };
  assert.equal(matchupPlayerDay(morning, date), previous);
  const selected = matchupPlayerDay(morning, date)!;
  assert.equal(todayMatchupPlayers(matchup, [player], selected, selected.date)[0].stats.PTS, 25);
  for (const state of ["scheduled", "delayed", "postponed", "cancelled"] as const) {
    assert.equal(matchupPlayerDay({ ...morning, games: [{ ...game, state }] }, date), previous);
  }
  for (const state of ["live", "final", "suspended"] as const) {
    // The first game has neither fantasy team's players; still leave the recap.
    const started = { ...morning, games: [{ ...game, state, home: { ...game.home, abbrev: "LAL" }, away: { ...game.away, abbrev: "BOS" } }], performances: [] };
    assert.equal(matchupPlayerDay(started, date), started);
    assert.deepEqual(todayMatchupPlayers(matchup, [player], matchupPlayerDay(started, date), date), []);
  }
  const recapRows = todayMatchupPlayers(matchup, [{ ...player, slot: "BE" }], selected, selected.date);
  assert.equal(matchupPlayerGroups(recapRows, true, true)[0].label, "Current bench / IR");
});

test("recap selection respects Pacific date, failed feeds, and loader's started-day latch", () => {
  const previous = { date: "2026-11-01", fetchedAt: null, status: "stale" as const,
    games: [{ ...game, startsAt: "2026-11-02T01:00:00Z", state: "final" as const }] };
  const morning: TodayData = { date, fetchedAt: null, status: "ready", games: [], performerDay: previous };
  assert.equal(matchupPlayerDay(morning, date)?.status, "stale");
  assert.equal(matchupPlayerDay({ ...morning, games: previous.games }, date), previous);
  assert.equal(matchupPlayerDay({ ...morning, date: "2026-11-01" }, date), undefined);
  assert.equal(matchupPlayerDay(undefined, date), undefined);
  for (const bad of [{ ...previous, status: "error" as const }, { ...previous, date: "2026-11-04" }, { ...previous, games: [] }]) {
    const current = { ...morning, performerDay: bad };
    assert.equal(matchupPlayerDay(current, date), current);
  }
  const latched: TodayData = { ...morning, status: "error", performerDay: { ...morning, date } };
  assert.equal(matchupPlayerDay(latched, date), latched);
});

test("Today separates fantasy bench/IR by slot without changing earned weekly totals or stat sort order", () => {
  const player = snapshotSchema.parse(demo).players[0];
  const rows = [
    { slot: "BE", status: "ACTIVE", pts: 40 },
    { slot: "PG", status: "OUT", pts: 30 },
    { slot: "13", status: "ACTIVE", pts: 20 },
    { slot: "UTIL", status: "ACTIVE", pts: 10 },
    { slot: "12", status: "ACTIVE", pts: 5 },
    { slot: null, status: "ACTIVE", pts: 3 },
  ].map((entry, i) => ({ playerId: i, name: `Player ${i}`, teamId: 1, stats: { PTS: entry.pts }, player: { ...player, id: i, slot: entry.slot, status: entry.status } }));
  const groups = matchupPlayerGroups(rows, true);
  assert.deepEqual(groups.map(group => group.key), ["active", "inactive", "unknown"]);
  assert.deepEqual(groups[0].rows.map(row => row.stats.PTS), [30, 10]);
  assert.deepEqual(groups[1].rows.map(row => row.stats.PTS), [40, 20, 5]);
  assert.deepEqual(groups[2].rows.map(row => row.stats.PTS), [3]);
  assert.deepEqual(matchupPlayerGroups(rows, false), [{ key: "week", label: null, rows }]);
  assert.deepEqual(matchupPlayerGroups([rows[0]], true).map(group => group.key), ["inactive"]);
});

test("today rows use only today's NBA stats and current ownership, including bench and IR", () => {
  const snapshot = snapshotSchema.parse(demo), matchup = snapshot.matchups[0];
  const player = { ...snapshot.players[0], teamId: matchup.home.teamId, nbaTeam: "NY", slot: "BE", stats: { PTS: 999 } };
  const off = { ...player, id: 9876, nbaTeam: "BOS" };
  const inactive = { ...player, id: 9877, status: "OUT", slot: "IR", teamId: matchup.away.teamId };
  matchup.home.performers = [{ playerId: player.id, name: player.name, stats: { PTS: 100 } }];
  const today: TodayData = { date, fetchedAt: null, status: "ready", games: [game], performances: [
    { playerId: player.id, gameId: game.id, minutes: 22.5, stats: { PTS: 12, FGM: 4, FGA: 10, FTM: 0, FTA: 0, STL: 0 } },
    { playerId: off.id, gameId: "yesterday", minutes: 40, stats: { PTS: 50 } },
  ] };
  const rows = todayMatchupPlayers(matchup, [player, off, inactive], today, date);
  assert.deepEqual(rows.map(row => row.playerId), [player.id, inactive.id]);
  assert.equal(rows[0].stats.PTS, 12);
  assert.equal(rows[0].stats.MIN, 22.5);
  assert.equal(rows[0].stats["FG%"], .4);
  assert.equal(rows[0].stats["FT%"], null);
  assert.equal(rows[0].stats.STL, 0);
  assert.deepEqual(rows[1].stats, {});
  assert.equal(rows[1].teamId, matchup.away.teamId);
  assert.equal(matchupPlayers(matchup, [player])[0].stats.PTS, 100);
  assert.equal(matchupGameLabel(game, false), "In progress");
  assert.equal(matchupGameLabel(game, true), "Last seen live");
});

test("daily row builder only uses the explicitly selected date and never invents pregame stats", () => {
  const snapshot = snapshotSchema.parse(demo), matchup = snapshot.matchups[0];
  const player = { ...snapshot.players[0], teamId: matchup.home.teamId, nbaTeam: "NYK" };
  const recap = { date: "2026-11-01", fetchedAt: null, status: "ready" as const, games: [game], performances: [{ playerId: player.id, gameId: game.id, minutes: 30, stats: { PTS: 50 } }] };
  const today: TodayData = { date, fetchedAt: null, status: "ready", games: [{ ...game, state: "scheduled" }], performerDay: recap };
  const rows = todayMatchupPlayers(matchup, [player], today, date);
  assert.deepEqual(rows[0].stats, {});
  assert.match(matchupGameLabel(rows[0].game!, false), /4:00 PM PT/);
  assert.deepEqual(todayMatchupPlayers(matchup, [player], recap, date), []);
  assert.deepEqual(todayMatchupPlayers(matchup, [player], { ...today, status: "error" }, date), []);
  assert.deepEqual(todayMatchupPlayers(matchup, [player], { ...today, games: [{ ...game, startsAt: "2026-11-02T01:00:00Z" }] }, date), []);
  for (const state of ["final", "postponed", "cancelled"] as const) {
    const row = todayMatchupPlayers(matchup, [player], { ...today, games: [{ ...game, state, detail: "" }] }, date)[0];
    assert.doesNotMatch(matchupGameLabel(row.game!, false), /In progress/);
    assert.deepEqual(row.stats, {});
  }
});

test("weekly rows retain credited team after a trade and never substitute season averages", () => {
  const snapshot = snapshotSchema.parse(demo);
  const matchup = snapshot.matchups[0];
  const traded = { ...snapshot.players[0], teamId: matchup.away.teamId, stats: { PTS: 999 } };
  matchup.home.performers = [{ playerId: traded.id, name: traded.name, stats: { PTS: 12, GP: 1, TO: 0 } }];
  matchup.home.performanceComplete = false;
  matchup.away.performers = [];
  const rows = matchupPlayers(matchup, [traded]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].teamId, matchup.home.teamId);
  assert.equal(rows[0].stats.PTS, 12);
  assert.equal(rows[1].stats.PTS, undefined);
  assert.equal(rows.filter(r => r.teamId === matchup.away.teamId).length, 1);
  assert.deepEqual(sortMatchupPlayers(rows, "TO", false).map(r => r.stats.TO), [0, undefined]);
  assert.deepEqual(sortMatchupPlayers(rows, "PTS", true).map(r => r.stats.PTS), [12, undefined]);
});

test("weekly sorting handles percentages, ties and missing values in both directions", () => {
  const rows = [
    { playerId: 1, name: "B", teamId: 1, stats: { "FG%": .5 } },
    { playerId: 2, name: "C", teamId: 1, stats: { "FG%": null } },
    { playerId: 3, name: "A", teamId: 1, stats: { "FG%": .5 } },
    { playerId: 4, name: "D", teamId: 1, stats: { "FG%": .7 } },
  ];
  assert.deepEqual(sortMatchupPlayers(rows, "FG%", true).map(r => r.name), ["D", "A", "B", "C"]);
  assert.deepEqual(sortMatchupPlayers(rows, "FG%", false).map(r => r.name), ["A", "B", "D", "C"]);
});
