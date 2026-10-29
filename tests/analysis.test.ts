import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema, CATEGORIES, type Player } from "../lib/schema";
import {
  DEFAULT_WEIGHTS,
  exchangePlayers,
  recordRanks,
  relevantNews,
  rosterValue,
  teamPower,
} from "../lib/analysis";
import demo from "../lib/demo.json";
const data = snapshotSchema.parse(demo);
test("trade baselines agree with worker team scores and ranks", () => {
  for (const value of teamPower(data.teams, data.players)) {
    assert.equal(value.score, value.team.talent);
    assert.equal(value.rank, value.team.talentRank);
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
  assert.equal(partial.score, 2);
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
