import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchupGrid } from "../components/league/matchup-grid";
import Dashboard from "../components/dashboard";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";

test("server shell waits for the browser route instead of flashing League on direct links", () => {
  const data = snapshotSchema.parse(demo);
  const render = (myTeamId: number) =>
    renderToStaticMarkup(
      createElement(Dashboard, {
        data: { ...data, league: { ...data.league, myTeamId } },
        syncFailure: null,
      }),
    );
  const html = render(data.teams[0].id);
  assert.equal(html, render(data.teams.at(-1)!.id));
  assert.equal(
    (html.match(/class="matchup-card"/g) ?? []).length,
    0,
  );
  assert.doesNotMatch(
    html,
    /My roster|My players|my-team-button|my-row|you-label/,
  );
  assert.doesNotMatch(html, /teamId=/);
  const mainNav = html.match(
    /<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/,
  )![1];
  assert.equal((mainNav.match(/<a /g) ?? []).length, 7);
  assert.match(mainNav, /Trades/);
  assert.doesNotMatch(mainNav, /Standings|Rankings|News|Overview/);
  assert.doesNotMatch(html, /standings-table|League awards/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading…/);
  assert.doesNotMatch(html, /aria-current="page"/);
  assert.match(html, /basketball\/league\?/);
});


test("shared matchup grid includes every matchup without favoring a manager", () => {
  const data = snapshotSchema.parse(demo);
  const html = renderToStaticMarkup(createElement(MatchupGrid, {
    matchups: data.matchups, teams: data.teams, period: data.league.matchupPeriod, onMatchup: () => {},
  }));
  assert.equal((html.match(/class="matchup-card"/g) ?? []).length, data.matchups.length);
  assert.doesNotMatch(html, /My roster|My players|my-team-button|my-row|you-label/);
});
