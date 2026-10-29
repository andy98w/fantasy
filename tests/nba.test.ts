import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { availableToday, gameLabel, nbaDate, nextDate, normalizeScoreboard, playerStrengths, type TodayData } from "../lib/nba";
import { snapshotSchema, type Player } from "../lib/schema";
import { Today } from "../components/league/today";
import demo from "../lib/demo.json";
import fixture from "./fixtures/nba-scoreboard.json";

const date = "2026-10-29";
const games = normalizeScoreboard(fixture, date);
const base = snapshotSchema.parse(demo).players[0];
const player = (id: number, values: Partial<Player> = {}): Player => ({ ...base, id, name: `Player ${id}`, teamId: null, nbaTeam: "ATL", availability: "FREEAGENT", zTotal: id, power: id * 10, contributions: { ...base.contributions, STL: id, TO: -id }, ...values });

test("scoreboard normalizes ESPN team aliases and Pacific tip-offs", () => {
  assert.equal(games.length, 3);
  assert.equal(games[1].home.abbrev, "NOP");
  assert.equal(games[0].home.score, null);
  assert.equal(gameLabel(games[0]), "5:00 PM");
  assert.equal(gameLabel(games[2]), "7:00 PM");
  assert.equal(normalizeScoreboard(fixture, "2026-10-30").length, 0);
});

test("today follows Pacific midnight and daylight saving boundaries", () => {
  assert.equal(nbaDate(new Date("2026-10-30T06:59:59Z")), "2026-10-29");
  assert.equal(nbaDate(new Date("2026-10-30T07:00:00Z")), "2026-10-30");
  assert.equal(nbaDate(new Date("2026-12-01T07:59:59Z")), "2026-11-30");
  assert.equal(nbaDate(new Date("2026-12-01T08:00:00Z")), "2026-12-01");
  assert.equal(nextDate("2026-12-31"), "2027-01-01");
  const late = structuredClone(fixture);
  late.events[0].competitions[0].date = "2026-10-30T06:30Z";
  assert.equal(normalizeScoreboard(late, date).length, 3);
});

test("live zero scores, final scores and postponed games remain distinct", () => {
  const payload = structuredClone(fixture);
  const competition = payload.events[0].competitions[0];
  competition.status.type = { ...competition.status.type, name: "STATUS_IN_PROGRESS", state: "in", completed: false, shortDetail: "11:59 - 1st" };
  const live = normalizeScoreboard(payload, date)[0];
  assert.equal(live.state, "live");
  assert.equal(live.home.score, 0);
  assert.equal(gameLabel(live), "11:59 - 1st");
  competition.status.type = { ...competition.status.type, name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final/OT" };
  competition.competitors[0].score = "112";
  assert.equal(normalizeScoreboard(payload, date)[0].home.score, 112);
  assert.equal(gameLabel(normalizeScoreboard(payload, date)[0]), "Final/OT");
  competition.status.type.name = "STATUS_POSTPONED";
  const postponed = normalizeScoreboard(payload, date)[0];
  assert.equal(postponed.state, "postponed");
  assert.equal(postponed.home.score, null);
  assert.equal(availableToday([player(1)], [postponed], { now: 0, notStarted: false, category: "all" }).length, 0);
});

test("invalid scoreboard data is an error rather than a no-games result", () => {
  assert.throws(() => normalizeScoreboard({}, date));
  const missing = structuredClone(fixture);
  missing.events[0].competitions[0].competitors.pop();
  assert.throws(() => normalizeScoreboard(missing, date));
  const badDate = structuredClone(fixture);
  badDate.events[0].competitions[0].date = "not a date";
  assert.throws(() => normalizeScoreboard(badDate, date));
  assert.deepEqual(normalizeScoreboard({ events: [] }, date), []);
});

test("today candidates require league availability and a scheduled NBA team", () => {
  const players = [player(1), player(3, { availability: "WAIVERS", status: "OUT" }), player(2, { teamId: 5 }),
    player(4, { availability: "UNKNOWN" }), player(5, { nbaTeam: "BOS" }), player(6, { nbaTeam: "NO", zTotal: null, power: null })];
  const copy = structuredClone(players);
  const result = availableToday(players, games, { notStarted: false, category: "all", now: 0 });
  assert.deepEqual(result.map((r) => r.player.id), [3, 1, 6]);
  assert.equal(result[0].player.availability, "WAIVERS");
  assert.equal(result[0].player.status, "OUT");
  assert.equal(result[0].opponent, "vs CLE");
  assert.equal(result[2].opponent, "vs SAC");
  assert.deepEqual(players, copy);
});

test("not-started excludes live/final games and scheduled tips that have passed", () => {
  const now = Date.parse(games[0].startsAt);
  assert.equal(availableToday([player(1)], games, { notStarted: true, category: "all", now }).length, 0);
  assert.equal(availableToday([player(1)], games, { notStarted: true, category: "all", now: now - 1 }).length, 1);
  for (const state of ["live", "final", "delayed"] as const) {
    assert.equal(availableToday([player(1)], [{ ...games[0], state }], { notStarted: true, category: "all", now: 0 }).length, 0);
  }
});

test("category filters rank measured positive contributions, including inverted turnovers", () => {
  const players = [player(1), player(2, { contributions: { STL: -3, TO: 2 } }), player(3, { contributions: { STL: 4, TO: -2 } }), player(4, { zTotal: null })];
  assert.deepEqual(availableToday(players, games, { notStarted: false, category: "STL", now: 0 }).map((r) => r.player.id), [3, 1]);
  assert.deepEqual(availableToday(players, games, { notStarted: false, category: "TO", now: 0 }).map((r) => r.player.id), [2]);
  assert.deepEqual(playerStrengths(players[1]), ["TO"]);
  assert.deepEqual(playerStrengths(players[3]), []);
});

test("Today shows score failure separately from an empty schedule", () => {
  const render = (data: TodayData) => renderToStaticMarkup(createElement(Today, { data, players: [], minimumGames: 3, onPlayer: () => {} }));
  const data: TodayData = { date, fetchedAt: `${date}T20:00:00Z`, status: "error", games: [] };
  assert.match(render(data), /Scores unavailable/);
  assert.doesNotMatch(render(data), /No NBA games/);
  assert.match(render({ ...data, status: "ready" }), /No NBA games today/);
  assert.match(render({ ...data, status: "stale", games }), /Scores may be out of date/);
});
