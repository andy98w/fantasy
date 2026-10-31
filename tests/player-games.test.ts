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
