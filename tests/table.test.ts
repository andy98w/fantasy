import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compareTableValues, matchesSearch, statSortValue, tableRows } from "../lib/table";
import { sortPlayers } from "../components/league/format";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
import { Standings, TeamRankings } from "../components/league/team-views";
import { PlayerTable } from "../components/league/player-table";
import { CategoryComparison } from "../components/league/category-comparison";
const data = snapshotSchema.parse(demo);

test("sorting keeps missing values last in both directions and uses real numbers", () => {
  for (const descending of [true, false]) {
    assert.ok(compareTableValues(null, 0, descending) > 0);
    assert.ok(compareTableValues(0, undefined, descending) < 0);
    assert.ok(compareTableValues(NaN, 0, descending) > 0);
  }
  assert.ok(compareTableValues(10, 2) > 0);
  assert.ok(compareTableValues(-10, -2) < 0);
  assert.ok(compareTableValues("Team 10", "Team 2") > 0);
  assert.equal(statSortValue("0"), 0);
  assert.equal(statSortValue("—"), null);
  assert.equal(statSortValue("DNP"), null);
  assert.equal(statSortValue("25:30"), 25.5);
  assert.equal(statSortValue("52.2%"), 52.2);
  assert.equal(statSortValue("−4"), -4);
  assert.ok(compareTableValues(statSortValue("10-12"), statSortValue("9-15")) > 0);
  assert.ok(compareTableValues(statSortValue("10-12"), statSortValue("10-15")) < 0);
});

test("search combines words, ignores case/accents, and filtering never changes ranks or input order", () => {
  assert.ok(matchesSearch("Nikola Jokić Denver", "den jokic"));
  assert.equal(matchesSearch("Oct 30 vs IND", "oct atl"), false);
  const rows = [{ name: "Zed", rank: 4, score: 10 }, { name: "Álex", rank: 2, score: 10 }, { name: "Ben", rank: 3, score: null }];
  const result = tableRows(rows, "alex", { key: "score", descending: true }, row => row.name, row => row.score);
  assert.deepEqual(result, [rows[1]]);
  assert.equal(result[0].rank, 2);
  assert.deepEqual(rows.map(row => row.rank), [4, 2, 3]);
  assert.deepEqual(tableRows(rows, "", { key: "score", descending: true }, row => row.name, row => row.score), rows);
});

test("player identity, rank, status, and team sorts use displayed values", () => {
  for (const key of ["name", "rank", "status", "team", "PTS", "TO"]) {
    const sorted = sortPlayers(data.players, { key, descending: false }, data.teams);
    assert.equal(sorted.length, data.players.length);
    assert.notEqual(sorted, data.players);
  }
  const byName = sortPlayers(data.players, { key: "name", descending: false });
  assert.ok(byName.every((p, i) => !i || compareTableValues(byName[i - 1].name, p.name) <= 0));
  const byRank = sortPlayers(data.players, { key: "rank", descending: false });
  assert.ok(byRank.every((p, i) => !i || compareTableValues(byRank[i - 1].rank, p.rank) <= 0));
});

test("every header in standings, power, players, and category comparisons exposes sorting", () => {
  const renders = [
    createElement(Standings, { teams: data.teams, onTeam: () => {} }),
    createElement(TeamRankings, { teams: data.teams, players: data.players, onTeam: () => {} }),
    createElement(PlayerTable, { players: data.players, teams: data.teams, minimumGames: 3, sort: { key: "power", descending: true }, onSort: () => {}, onSelect: () => {} }),
    createElement(CategoryComparison, { home: data.matchups[0].home, away: data.matchups[0].away, homeName: "A", awayName: "B" }),
  ];
  for (const element of renders) {
    const html = renderToStaticMarkup(element);
    const heads = [...html.matchAll(/<thead>(.*?)<\/thead>/gs)];
    assert.ok(heads.length);
    for (const [, head] of heads) {
      assert.equal((head.match(/<th\b/g) ?? []).length, (head.match(/class="table-sort-button"/g) ?? []).length);
    }
    assert.match(html, /type="search"/);
  }
});
