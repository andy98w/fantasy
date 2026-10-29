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
  assert.match(html, /basketball\/league\?/);
});
