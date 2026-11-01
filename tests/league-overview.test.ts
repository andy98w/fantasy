import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Dashboard from "../components/dashboard";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";

test("shared overview ignores configured owner team and includes every matchup", () => {
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
    data.matchups.length,
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
  assert.match(html, /Today’s performers/);
  assert.match(html, /today-panel/);
  assert.match(html, /Roster news/);
  assert.match(html, /basketball\/league\?/);
});
