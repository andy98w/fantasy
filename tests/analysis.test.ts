import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema, CATEGORIES, type Player } from "../lib/schema";
import {
  DEFAULT_WEIGHTS,
  exchangePlayers,
  recordRanks,
  relevantNews,
  rosterValue,
  teamRating,
  taperCategory,
  teamPower,
} from "../lib/analysis";
import demo from "../lib/demo.json";
const data = snapshotSchema.parse(demo);
test("team leaderboard uses the same tapered rating as team profiles and trade fit", () => {
  for (const value of teamPower(data.teams, data.players)) {
    const roster = data.players.filter(p => p.teamId === value.team.id);
    assert.equal(value.score, teamRating(roster).score);
    assert.deepEqual(value.categories, rosterValue(roster).categories);
  }
});
const p = (id: number, teamId: number, value: number | null): Player => ({
  ...data.players[0],
  id,
  teamId,
  name: `Player ${id}`,
  zTotal: value,
  contributions: Object.fromEntries(
    CATEGORIES.map((c) => [c, c === "AST" ? (value ?? 0) : 0]),
  ),
});

test("record ties share competition ranks and ignore ESPN seeds", () => {
  const teams = data.teams.slice(0, 3).map((t, index) => ({
    ...t,
    standing: 3 - index,
    wins: index === 2 ? 1 : 2,
    losses: index === 2 ? 2 : 1,
    ties: 0,
  }));
  assert.deepEqual([...recordRanks(teams).values()], [1, 1, 3]);
  const zero = teams.map((t) => ({ ...t, wins: 0, losses: 0, ties: 0 }));
  assert.deepEqual([...recordRanks(zero).values()], [1, 1, 1]);
});

test("incomplete teams are provisional, equal scores tie, and unmeasured teams remain unranked", () => {
  const teams = data.teams.slice(0, 3);
  const players = [
    p(1, teams[0].id, 2),
    p(2, teams[0].id, null),
    p(3, teams[1].id, 2),
    p(4, teams[2].id, null),
  ];
  const power = teamPower(teams, players);
  assert.deepEqual(
    power.map((t) => t.rank),
    [1, 1, null],
  );
  const partial = power.find((t) => t.team.id === teams[0].id)!;
  assert.equal(partial.provisional, true);
  assert.equal(partial.rated, 1);
  assert.equal(partial.size, 2);
  assert.equal(partial.score, teamRating([players[0]]).score);
  assert.equal(players[1].zTotal, null);
  assert.equal(power[2].score, null);
});

test("uneven trades conserve players and category totals without mutating imported rosters", () => {
  const players = [p(1, 1, 2), p(2, 1, -1), p(3, 2, 3), p(4, 2, null)];
  const original = JSON.stringify(players);
  const result = exchangePlayers(players, 1, 2, [1, 2], [3]);
  assert.deepEqual(
    result.left.after.map((p) => p.id),
    [3],
  );
  assert.deepEqual(
    result.right.after.map((p) => p.id),
    [4, 1, 2],
  );
  for (const c of CATEGORIES)
    assert.equal(
      rosterValue(result.left.before).categories[c] +
        rosterValue(result.right.before).categories[c],
      rosterValue(result.left.after).categories[c] +
        rosterValue(result.right.after).categories[c],
    );
  assert.equal(JSON.stringify(players), original);
  assert.equal(rosterValue(result.right.after).missing[0].id, 4);
});

test("punts and priorities change fit without changing category strengths", () => {
  const players = [p(1, 1, 3)];
  const normal = rosterValue(players),
    punt = rosterValue(players, { ...DEFAULT_WEIGHTS, AST: 0 }),
    priority = rosterValue(players, { ...DEFAULT_WEIGHTS, AST: 2 });
  assert.equal(normal.score, 3);
  assert.equal(punt.score, 0);
  assert.equal(priority.score, 6);
  assert.deepEqual(normal.categories, punt.categories);
  const fewerTurnovers = {
    ...p(2, 2, 2),
    contributions: { ...p(2, 2, 0).contributions, TO: 2 },
  };
  assert.equal(rosterValue([fewerTurnovers]).score, 2);
});

test("roster power includes IR values and is invariant to injury/slot placement", () => {
  const roster = [p(1,1,2), {...p(2,1,10), slot:"IR", status:"OUT"}, {...p(3,1,-5),slot:"IR"}, {...p(4,1,null),slot:"IR"}];
  const value = rosterValue(roster);
  assert.equal(value.score,7); assert.equal(value.categories.AST,7);
  assert.equal(value.size,4); assert.equal(value.rated,3); assert.equal(value.provisional,true);
  assert.equal(teamRating(roster).score, teamRating(roster.map(p => ({...p,slot:"BE",status:"ACTIVE"}))).score);
  assert.equal(rosterValue([roster[1]]).score,10);
});

test("trading an IR player transfers their full underlying value without mutating placement", () => {
  const players = [p(1,1,2), {...p(2,1,10),slot:"IR"},p(3,2,3)];
  const trade = exchangePlayers(players,1,2,[2],[3]);
  assert.equal(rosterValue(trade.left.before).score,12);
  assert.equal(rosterValue(trade.left.after).score,5);
  assert.equal(rosterValue(trade.right.after).score,10);
  assert.equal(trade.right.after[0].slot,"IR");
});

test("same-team, duplicate and stale player selections are rejected", () => {
  const players = [p(1, 1, 2), p(2, 2, 3)];
  assert.throws(
    () => exchangePlayers(players, 1, 1, [], []),
    /different teams/,
  );
  assert.throws(() => exchangePlayers(players, 1, 2, [1, 1], []), /once/);
  assert.throws(() => exchangePlayers(players, 1, 2, [2], []), /no longer/);
  assert.throws(() => exchangePlayers(players, 1, 2, [999], []), /no longer/);
});

test("news only includes rostered players and prioritizes same-day availability news", () => {
  const base = {
    source: "Test",
    url: "https://example.com/news",
    publishedAt: "2026-10-29T12:00:00Z",
  };
  const news = [
    { ...base, id: "general", title: "NBA roundup", playerIds: [] },
    { ...base, id: "recap", title: "Player scores 20", playerIds: [1] },
    { ...base, id: "injury", title: "Player ruled out", playerIds: [1] },
    { ...base, id: "free", title: "Free agent returns", playerIds: [3] },
  ];
  assert.deepEqual(
    relevantNews(news, [p(1, 1, 2), { ...p(3, 2, 3), teamId: null }]).map(
      (n) => n.id,
    ),
    ["injury", "recap"],
  );
  assert.equal(relevantNews(news, [p(1, 1, 2)], 2).length, 0);
});

test("category taper is symmetric, monotone, near-linear at zero, and has no hard cap", () => {
  assert.equal(taperCategory(0), 0);
  assert.ok(Math.abs(taperCategory(.01) - .01) < .000001);
  for (const z of [.1, 1, 4, 10, 100]) {
    assert.equal(taperCategory(-z), -taperCategory(z));
    assert.ok(taperCategory(z + 1) > taperCategory(z));
    assert.ok(taperCategory(z + 1) - taperCategory(z) < taperCategory(z) - taperCategory(z - 1));
  }
  assert.ok(taperCategory(10.8) - taperCategory(4.6) < taperCategory(4.6));
});

test("team rating rewards spread strength, tapers after aggregation, and leaves player values intact", () => {
  const concentrated = { ...p(100, 1, 10.8), contributions: { ...p(100, 1, 0).contributions, BLK: 10.8 } };
  const balanced = { ...p(101, 2, 10.8), contributions: { ...p(101, 2, 0).contributions, BLK: 5.4, AST: 5.4 } };
  const before = JSON.stringify([concentrated, balanced]);
  assert.ok(teamRating([balanced]).score! > teamRating([concentrated]).score!);
  assert.equal(teamRating([concentrated]).categories.BLK, 10.8);
  const halves = [1,2].map(id => ({ ...concentrated, id, contributions: { ...concentrated.contributions, BLK: 5.4 } }));
  assert.equal(teamRating(halves).score, teamRating([concentrated]).score);
  assert.equal(JSON.stringify([concentrated, balanced]), before);
});

test("tapered team fit respects IR, unknowns, punts and priorities", () => {
  const roster = [p(201,1,10), { ...p(202,1,100), slot: "IR" }, p(203,1,null)];
  const rating = teamRating(roster);
  assert.equal(rating.score, teamRating(roster.slice(0,2)).score);
  assert.equal(rating.provisional, true);
  assert.equal(teamRating([roster[1],roster[2]]).score, teamRating([roster[1]]).score);
  assert.equal(teamRating(roster, { ...DEFAULT_WEIGHTS, AST: 0 }).score, 0);
  const priority = teamRating(roster, { ...DEFAULT_WEIGHTS, AST: 2 });
  assert.ok(Math.abs(priority.score! - 2 * rating.score!) <= .001);
  assert.deepEqual(priority.categories, rating.categories);
});
