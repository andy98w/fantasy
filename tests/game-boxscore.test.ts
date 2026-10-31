import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeGameBoxscore, validGameId } from "../lib/game-boxscore";
import { createGameBoxscoreLoader } from "../lib/game-boxscore-loader";
import { BoxscoreTable } from "../components/league/game-dialog";

const id = "401909277";
const at = "2026-10-31T06:00:00Z";
function fixture(state = "post") {
  return {
    header: { id, competitions: [{ date: "2026-10-30T23:00Z", status: { type: { name: state === "post" ? "STATUS_FINAL" : "STATUS_SCHEDULED", state, shortDetail: state === "post" ? "Final" : "7:00 PM ET" } }, competitors: [
      { homeAway: "home", score: "95", team: { id: "27", abbreviation: "WSH", displayName: "Washington Wizards", logos: [{ href: "https://a.espncdn.com/i/teamlogos/nba/500/wsh.png" }] } },
      { homeAway: "away", score: "79", team: { id: "30", abbreviation: "CHA", displayName: "Charlotte Hornets" } },
    ] }] },
    boxscore: { players: [{ team: { id: "27" }, statistics: [{ keys: ["minutes", "points", "fieldGoalsMade-fieldGoalsAttempted", "steals"], totals: ["", "95", "28-72", "6"], athletes: [
      { athlete: { id: "6583", displayName: "Anthony Davis" }, starter: true, didNotPlay: false, reason: "COACH'S DECISION", stats: ["34", "25", "8-18", "0"] },
      { athlete: { id: "2581184", displayName: "Anthony Gill" }, starter: false, didNotPlay: true, reason: "COACH'S DECISION", stats: [] },
    ] }] }] },
  };
}

test("box scores map stat keys, preserve zero, totals, starters and DNP without inventing missing values", () => {
  const result = normalizeGameBoxscore(fixture(), id, at);
  assert.equal(result.game.home.abbrev, "WAS");
  assert.equal(result.game.home.score, 95);
  assert.match(result.game.home.logo!, /^https:/);
  const [davis, gill] = result.teams[0].players;
  assert.equal(davis.stats.steals, "0");
  assert.equal(davis.stats.rebounds, undefined);
  assert.equal(davis.reason, "");
  assert.equal(gill.didNotPlay, true);
  assert.equal(result.teams[0].totals.points, "95");
  const html = renderToStaticMarkup(createElement(BoxscoreTable, { team: result.game.home, box: result.teams[0] }));
  assert.match(html, /DNP/);
  assert.match(html, /Starters/);
  assert.match(html, /Bench/);
  assert.match(html, /8-18/);
  assert.match(html, /—/);
});

test("pregame and empty box scores are valid and do not show fictional zero scores", () => {
  const data = fixture("pre");
  const { boxscore: _, ...pregame } = data;
  const result = normalizeGameBoxscore(pregame, id, at);
  assert.equal(result.game.home.score, null);
  assert.deepEqual(result.teams, []);
  assert.equal(result.game.state, "scheduled");
});

test("rejects wrong game/team/player identities and malformed stats", () => {
  assert.throws(() => normalizeGameBoxscore(fixture(), "401000000", at));
  const wrong = fixture(); wrong.boxscore.players[0].team.id = "99";
  assert.throws(() => normalizeGameBoxscore(wrong, id, at));
  const duplicate = fixture(); duplicate.boxscore.players[0].statistics[0].athletes.push(duplicate.boxscore.players[0].statistics[0].athletes[0]);
  assert.throws(() => normalizeGameBoxscore(duplicate, id, at));
  assert.equal(validGameId("../health"), false);
  assert.equal(validGameId("401909277&event=1"), false);
});

test("coalesces simultaneous requests, caches finals, and retries with stale stats on upstream failure", async () => {
  let now = Date.parse(at), calls = 0, fail = false;
  const request: typeof fetch = async (url) => {
    calls++;
    assert.equal(String(url), `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`);
    return fail ? new Response(null, { status: 503 }) : Response.json(fixture());
  };
  const load = createGameBoxscoreLoader(request, () => now);
  const [a, b] = await Promise.all([load(id), load(id)]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  now += 30_000; await load(id); assert.equal(calls, 1);
  now += 300_000; fail = true;
  const stale = await load(id);
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, a.fetchedAt);
  await load(id); assert.equal(calls, 2);
  now += 21_000; fail = false;
  assert.equal((await load(id)).stale, false); assert.equal(calls, 3);
});

test("live updates refresh after 20 seconds and failed first fetches are throttled", async () => {
  let now = Date.parse(at), calls = 0, fail = true;
  const load = createGameBoxscoreLoader(async () => {
    calls++;
    if (fail) throw new Error("offline");
    return Response.json(fixture("in"));
  }, () => now);
  await assert.rejects(load(id)); await assert.rejects(load(id)); assert.equal(calls, 1);
  now += 21_000; fail = false;
  assert.equal((await load(id)).game.state, "live");
  now += 21_000; await load(id); assert.equal(calls, 3);
  await assert.rejects(load("invalid")); assert.equal(calls, 3);
});
