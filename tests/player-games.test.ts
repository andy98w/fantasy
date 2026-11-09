import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/player-gamelog.json";
import { createPlayerGamesLoader, normalizePlayerGames, validPlayerGamesRequest } from "../lib/player-games";
const at = "2026-10-31T16:00:00Z";

test("player game logs join stat rows to games, newest first, excluding preseason", () => {
  const result = normalizePlayerGames(fixture, "2027", at);
  assert.equal(result.games.length, 6);
  const first = result.games[0];
  assert.equal(first.game.id, "401909282");
  assert.equal(first.opponent, "vs IND");
  assert.equal(first.stats.points, "31");
  assert.equal(first.stats.rebounds, "18");
  assert.equal(first.stats.steals, "0");
  assert.equal(first.game.home.score, 145);
  assert.equal(result.games[1].opponent, "@ ATL");
  assert.equal(result.games[1].game.away.abbrev, "MIA");
  assert.equal(result.games[1].game.away.score, 129);
  assert.equal(result.games.some((row) => row.game.id === "401898404"), false);
});

test("empty seasons remain empty and invalid identity/season responses fail explicitly", () => {
  assert.deepEqual(normalizePlayerGames({ names: [], events: {}, seasonTypes: [] }, "2027", at).games, []);
  assert.throws(() => normalizePlayerGames({}, "2027", at));
  assert.throws(() => normalizePlayerGames({ ...fixture, events: {} }, "2027", at));
  assert.throws(() => normalizePlayerGames({ ...fixture, filters: [{ name: "season", value: "2026" }] }, "2027", at));
  const broken = structuredClone(fixture);
  broken.events["401909282"].homeTeamId = "99";
  assert.throws(() => normalizePlayerGames(broken, "2027", at));
  assert.equal(validPlayerGamesRequest("3032977", "2027"), true);
  assert.equal(validPlayerGamesRequest("1/../2", "2027"), false);
  assert.equal(validPlayerGamesRequest("3032977", "2027&season=2026"), false);
});

test("game log cache coalesces requests, preserves dated data on failure, and recovers", async () => {
  let calls = 0, now = Date.parse(at), failed = false;
  const load = createPlayerGamesLoader(async (url) => {
    calls++;
    assert.equal(String(url), "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3032977/gamelog?season=2027");
    if (failed) throw new Error("Unavailable");
    return Response.json(fixture);
  }, () => now);
  const [a, b] = await Promise.all([load("3032977", "2027"), load("3032977", "2027")]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await load("3032977", "2027"); assert.equal(calls, 1);
  now += 301_000; failed = true;
  const stale = await load("3032977", "2027");
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, a.fetchedAt);
  now += 21_000; failed = false;
  assert.equal((await load("3032977", "2027")).stale, false);
  await assert.rejects(load("invalid", "2027")); assert.equal(calls, 3);
});

import { playerGameHistory } from "../lib/current-player-game";
import { nbaDate, type TodayData } from "../lib/nba";
const logs = normalizePlayerGames(fixture, "2027", at).games;
const currentGame = { ...logs[0].game, state: "live" as const, detail: "6:12 - 3rd" };
const currentPlayer = { id: 3032977, nbaTeam: currentGame.home.abbrev };
const today: TodayData = {
  date: nbaDate(new Date(currentGame.startsAt)), fetchedAt: at, status: "ready", boxscoreStatus: "ready", games: [currentGame],
  performances: [{ playerId: currentPlayer.id, gameId: currentGame.id, minutes: 20.5,
    stats: { PTS: 14, REB: 5, AST: 3, STL: 0, BLK: 1, TO: 2, FGM: 5, FGA: 12, FTM: 2, FTA: 2, "3PM": 2, "3PA": 5 } }],
};

test("current live game is separate from sorted history with live stats and no premature result", () => {
  const { current, history } = playerGameHistory(currentPlayer, logs, today);
  assert.equal(current?.game.detail, "6:12 - 3rd");
  assert.equal(current?.stats.points, "14");
  assert.equal(current?.stats.minutes, "20:30");
  assert.equal(current?.stats["fieldGoalsMade-fieldGoalsAttempted"], "5-12");
  assert.equal(current?.stats.steals, "0");
  assert.equal(current?.result, "—");
  assert.equal(current?.stale, false);
  assert.equal(history.length, logs.length - 1);
  assert.equal(history.some(row => row.game.id === current?.game.id), false);
  assert.equal(playerGameHistory(currentPlayer, [], today).current?.stats.points, "14");
});

test("missing live stats stay unknown, and stale data is explicitly marked", () => {
  const result = playerGameHistory(currentPlayer, [], { ...today, status: "stale", performances: [] });
  assert.equal(result.current?.stale, true);
  assert.deepEqual(result.current?.stats, {});
  assert.equal(result.current?.result, "—");
  const otherPlayer = { ...currentPlayer, id: 99 };
  assert.deepEqual(playerGameHistory(otherPlayer, [], today).current?.stats, {});
});

test("final games bridge log delay then prefer corrected history without duplicating a row", () => {
  const finalDay: TodayData = { ...today, games: [{ ...currentGame, state: "final", detail: "Final", home: { ...currentGame.home, score: 110 }, away: { ...currentGame.away, score: 100 } }] };
  assert.equal(playerGameHistory(currentPlayer, [], finalDay).current?.result, "W");
  const corrected = playerGameHistory(currentPlayer, logs, finalDay);
  assert.deepEqual(corrected.current?.stats, logs[0].stats);
  assert.equal(corrected.history.length, logs.length - 1);
  assert.equal(playerGameHistory(currentPlayer, [], { ...finalDay, performances: [] }).current, null);
});

test("upcoming games, unrelated teams and the previous performer slate are not current games", () => {
  assert.equal(playerGameHistory(currentPlayer, logs).current, null);
  assert.equal(playerGameHistory({ ...currentPlayer, nbaTeam: "XXX" }, logs, today).current, null);
  assert.equal(playerGameHistory(currentPlayer, logs, { ...today, games: [{ ...currentGame, state: "scheduled" }] }).current, null);
  assert.equal(playerGameHistory(currentPlayer, logs, { ...today, date: "2026-11-08" }).current, null);
  assert.equal(playerGameHistory(currentPlayer, logs, { ...today, games: [], performerDay: today }).current, null);
});
