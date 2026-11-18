import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { snapshotSchema, playerSchema } from "../lib/schema";
import { isSneakyPick, rosteredPercent, sneakyScore } from "../lib/sneaky-picks";
import { sortPlayers } from "../components/league/format";
import { PlayerTable } from "../components/league/player-table";
import { BoxscoreTable } from "../components/league/game-dialog";
import demo from "../lib/demo.json";
const snapshot = snapshotSchema.parse(demo);
const base = { ...snapshot.players[0], gamesPlayed: 10, power: 80, percentRostered: 20 };

test("roster percentage preserves old snapshots, zero and precise small values without inventing data", () => {
  assert.equal(playerSchema.parse(snapshot.players[0]).percentRostered, undefined);
  assert.equal(rosteredPercent(undefined), "—");
  assert.equal(rosteredPercent(null), "—");
  assert.equal(rosteredPercent(0), "0%");
  assert.equal(rosteredPercent(0.02), "<0.1%");
  assert.equal(rosteredPercent(99.95), ">99.9%");
  assert.equal(rosteredPercent(57.83), "57.8%");
  for (const percentRostered of [-1, 101, NaN, "50"]) assert.equal(playerSchema.safeParse({ ...base, percentRostered }).success, false);
});

test("discovery score is bounded, favors power and scarcity, and never divides by zero", () => {
  assert.equal(sneakyScore(base), 64);
  assert.equal(sneakyScore({ ...base, percentRostered: 0 }), 80);
  assert.equal(sneakyScore({ ...base, percentRostered: 100 }), 0);
  for (const percentRostered of [null, undefined, NaN, -1, 101]) assert.equal(sneakyScore({ ...base, percentRostered }), null);
  assert.equal(sneakyScore({ ...base, power: null }), null);
  assert.ok(sneakyScore(base)! > sneakyScore({ ...base, power: 5, percentRostered: 0 })!);
  assert.ok(isSneakyPick(base, 50, 50, 3));
  assert.equal(isSneakyPick({ ...base, gamesPlayed: 2 }, 50, 50, 3), false);
  assert.equal(isSneakyPick({ ...base, power: 49 }, 50, 50, 3), false);
  assert.equal(isSneakyPick({ ...base, percentRostered: 50.01 }, 50, 50, 3), false);
  assert.equal(isSneakyPick({ ...base, percentRostered: null }, 50, 50, 3), false);
});

test("percentage sorting is numeric with unknowns last in either direction", () => {
  const players = [base, { ...base, id: 2, percentRostered: null }, { ...base, id: 3, percentRostered: 0 }];
  assert.deepEqual(sortPlayers(players, { key: "percentRostered", descending: true }).map(p => p.percentRostered), [20, 0, null]);
  assert.deepEqual(sortPlayers(players, { key: "percentRostered", descending: false }).map(p => p.percentRostered), [0, 20, null]);
  assert.equal(sortPlayers(players, { key: "sneakyScore", descending: true })[0].id, 3);
});

test("player tables display ESPN percentage separately from league ownership and keep pinned colspans aligned", () => {
  const html = renderToStaticMarkup(createElement(PlayerTable, {
    players: [base], teams: snapshot.teams, minimumGames: 3, sort: { key: "sneakyScore", descending: true }, onSort: () => {}, onSelect: () => {},
    ownership: true, sneaky: true, pinning: { players: [{ ...base, id: 2 }], onToggle: () => {}, onClear: () => {} },
  }));
  assert.match(html, /% rostered/);
  assert.match(html, /20%/);
  assert.match(html, /Sneaky score/);
  assert.match(html, /64.0/);
  assert.match(html, /colSpan="16"|colspan="16"/);
  assert.match(html, /Rostered across ESPN/);
});

test("NBA box scores show current roster percentage by player ID, with missing players unknown", () => {
  const html = renderToStaticMarkup(createElement(BoxscoreTable, {
    team: { id: "1", name: "Team", abbrev: "ATL", logo: null, score: 0 },
    players: [base], box: { id: "1", totals: {}, players: [
      { id: base.id, name: base.name, starter: true, didNotPlay: false, reason: "", stats: {} },
      { id: 999999, name: "Unknown player", starter: false, didNotPlay: false, reason: "", stats: {} },
    ] },
  }));
  assert.match(html, /% rostered/);
  assert.match(html, /20%/);
  assert.match(html, /ESPN roster percentage unavailable/);
});
