import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createNbaLoader } from "../lib/nba-loader";
import { DailyPerformers } from "../components/league/daily-performers";
import { Today } from "../components/league/today";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
import fixture from "./fixtures/nba-scoreboard.json";
import box from "./fixtures/nba-boxscore.json";

function event(day: string, state = "STATUS_FINAL") {
  const e = structuredClone(fixture.events.find(e => e.id === box.header.id)!);
  e.date = `${day}T23:00:00Z`;
  e.competitions[0].date = e.date;
  e.competitions[0].status.type = { ...e.competitions[0].status.type, name: state,
    state: state === "STATUS_FINAL" ? "post" : state === "STATUS_IN_PROGRESS" ? "in" : "pre", completed: state === "STATUS_FINAL", shortDetail: state === "STATUS_FINAL" ? "Final" : "Pregame" };
  return e;
}
function harness() {
  let now = Date.parse("2026-10-30T18:00:00Z");
  const state = { games: [event("2026-10-30", "STATUS_SCHEDULED")], history: [event("2026-10-29")], fail: false, boxFail: false, calls: [] as string[] };
  const request: typeof fetch = async input => {
    const url = new URL(String(input)); state.calls.push(url.toString());
    if (state.fail || state.boxFail && url.pathname.endsWith("summary")) throw new Error("Offline");
    if (url.pathname.endsWith("summary")) return Response.json(box);
    const dates = url.searchParams.get("dates")!;
    return Response.json({ events: dates < new Date(now).toISOString().slice(0, 10).replaceAll("-", "") ? state.history : state.games });
  };
  const load = createNbaLoader(request, () => now);
  return { state, load, advance: (ms = 21_000) => { now += ms; }, setTime: (s: string) => { now = Date.parse(s); } };
}

test("cold morning load keeps yesterday's stats separate from today's schedule and labels the date", async () => {
  const h = harness(), result = await h.load();
  assert.equal(result.date, "2026-10-30");
  assert.equal(result.games[0].state, "scheduled");
  assert.equal(result.performances?.length, 0);
  assert.equal(result.performerDay?.date, "2026-10-29");
  assert.ok(result.performerDay!.performances!.length > 0);
  assert.ok(h.state.calls.some(c => c.includes("dates=20261029")));
  const before = h.state.calls.length;
  await h.load(); assert.equal(h.state.calls.length, before);
  const data = snapshotSchema.parse(demo);
  const html = renderToStaticMarkup(createElement(DailyPerformers, { data, today: result, onPlayer: () => {} }));
  assert.match(html, /Last game day’s performers/); assert.match(html, /Oct 29 · PT/);
  const today = renderToStaticMarkup(createElement(Today, { data: result, players: [], minimumGames: 3, onPlayer: () => {} }));
  assert.match(today, /Oct 30/); assert.doesNotMatch(today, /Final/);
});

test("delays do not reset the recap; first live game switches even before box scores arrive", async () => {
  const h = harness(); await h.load();
  h.state.games = [event("2026-10-30", "STATUS_DELAYED")];
  h.setTime("2026-10-31T00:00:00Z");
  assert.equal((await h.load()).performerDay?.date, "2026-10-29");
  h.state.games = [event("2026-10-30", "STATUS_IN_PROGRESS")]; h.state.boxFail = true; h.advance();
  const live = await h.load();
  assert.equal(live.performerDay?.date, "2026-10-30");
  assert.equal(live.performerDay?.boxscoreStatus, "error");
  h.state.fail = true; h.advance(16 * 60_000);
  assert.equal((await h.load()).performerDay?.date, "2026-10-30", "An outage must not resurrect yesterday after tipoff");
});

test("days off and postponed/cancelled games keep the latest played slate", async () => {
  const h = harness(); h.state.games = []; h.state.history = [event("2026-10-28")];
  assert.equal((await h.load()).performerDay?.date, "2026-10-28");
  for (const state of ["STATUS_POSTPONED", "STATUS_CANCELED"]) {
    h.state.games = [event("2026-10-30", state)]; h.advance();
    assert.equal((await h.load()).performerDay?.date, "2026-10-28");
  }
});

test("Pacific midnight retains an ongoing prior slate and refreshes its box scores", async () => {
  const h = harness(); h.setTime("2026-10-30T06:59:50Z");
  h.state.games = [event("2026-10-29", "STATUS_IN_PROGRESS")];
  assert.equal((await h.load()).performerDay?.date, "2026-10-29");
  h.advance(); h.state.games = [event("2026-10-30", "STATUS_SCHEDULED")];
  const result = await h.load();
  assert.equal(result.date, "2026-10-30");
  assert.equal(result.performerDay?.date, "2026-10-29");
  assert.equal(result.performerDay?.games[0].state, "final");
});

test("history fetch failure preserves the saved recap without pretending it is current", async () => {
  const h = harness(); await h.load(); h.state.fail = true; h.advance(6 * 60_000);
  const result = await h.load();
  assert.equal(result.performerDay?.date, "2026-10-29");
  assert.equal(result.performerDay?.status, "stale");
  assert.ok(result.performerDay?.performances?.length);
});
