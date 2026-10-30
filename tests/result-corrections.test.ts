import test from "node:test";
import assert from "node:assert/strict";
import demo from "../lib/demo.json";
import { snapshotSchema } from "../lib/schema";
import { applyResultCorrections } from "../lib/result-corrections";
import { allPlay, leagueRecords, rivalry, seasonMatchups } from "../lib/season";
import { CATEGORIES } from "../lib/schema";

function fixture() {
  const snapshot = snapshotSchema.parse(demo);
  snapshot.mode = "live";
  snapshot.league = { ...snapshot.league, id: 1834203755, season: 2027, matchupPeriod: 2, scoringType: "H2H_MOST_CATEGORIES" };
  snapshot.teams = Array.from({ length: 12 }, (_, i) => ({ ...snapshot.teams[0], id: i + 1, wins: 0, losses: 0, ties: 0 }));
  snapshot.matchups = [];
  snapshot.matchupHistory = [];
  return snapshot;
}
const winners = [8, 9, 7, 1, 4, 3];

test("all six confirmed results update standings, rivalries and streaks without invented statistics", () => {
  const original = fixture();
  const result = applyResultCorrections(original);
  assert.equal(result.matchupHistory.length, 6);
  for (const team of result.teams) {
    assert.deepEqual([team.wins, team.losses, team.ties], winners.includes(team.id) ? [1, 0, 0] : [0, 1, 0]);
  }
  const matches = seasonMatchups(result);
  for (const [winner, loser] of [[8,6], [9,10], [7,5], [1,11], [4,12], [3,2]]) {
    const record = rivalry(matches, winner, loser);
    assert.deepEqual([record.wins, record.losses, record.ties], [1, 0, 0]);
    assert.deepEqual(record.closestIds, []);
  }
  assert.equal(allPlay(result.teams, matches, 1, CATEGORIES).rows.length, 0);
  const records = leagueRecords(matches);
  assert.deepEqual(records.map(r => r.id), ["streak"]);
  assert.deepEqual(records[0].holders.map(h => h.teamId).sort((a,b) => a-b), [...winners].sort((a,b) => a-b));
  assert.ok(matches.every(m => m.home.wins === null && m.away.wins === null && !m.home.performanceComplete));
  assert.equal(original.matchupHistory.length, 0);
  assert.ok(original.teams.every(t => t.wins === 0 && t.losses === 0));
  assert.deepEqual(applyResultCorrections(result), result);
  assert.deepEqual(applyResultCorrections(original), result); // another fresh ESPN import
});

test("ESPN-restored results are not counted twice and retain actual stats", () => {
  const recovered = applyResultCorrections(fixture());
  recovered.matchupHistory[0].home.stats.PTS = 300;
  recovered.matchupHistory[0].away.stats.PTS = 400;
  recovered.teams[0].wins += 3; // later weeks' results
  recovered.teams[1].losses += 2;
  assert.deepEqual(applyResultCorrections(recovered), recovered);
});

test("a conflicting finalized result replaces its record contribution instead of adding another game", () => {
  const snapshot = applyResultCorrections(fixture());
  snapshot.matchupHistory[0].result = "HOME";
  Object.assign(snapshot.teams.find(t => t.id === 6)!, { wins: 1, losses: 0 });
  Object.assign(snapshot.teams.find(t => t.id === 8)!, { wins: 0, losses: 1 });
  const result = applyResultCorrections(snapshot);
  assert.equal(result.teams.find(t => t.id === 8)!.wins, 1);
  assert.equal(result.teams.find(t => t.id === 8)!.losses, 0);
  assert.equal(result.teams.find(t => t.id === 6)!.wins, 0);
  assert.equal(result.teams.find(t => t.id === 6)!.losses, 1);
});

test("corrections are scoped to this live league, season, completed week and scoring format", () => {
  for (const update of [
    (s: ReturnType<typeof fixture>) => { s.mode = "demo"; },
    (s: ReturnType<typeof fixture>) => { s.league.id++; },
    (s: ReturnType<typeof fixture>) => { s.league.season++; },
    (s: ReturnType<typeof fixture>) => { s.league.matchupPeriod = 1; },
    (s: ReturnType<typeof fixture>) => { s.league.scoringType = "H2H_CATEGORY"; },
  ]) {
    const snapshot = fixture(); update(snapshot);
    assert.equal(applyResultCorrections(snapshot), snapshot);
  }
});

test("unrelated current scores stay current even if a stale copy exists in history", () => {
  const snapshot = applyResultCorrections(fixture());
  const old = { ...snapshot.matchupHistory[0], id: 7, period: 2 };
  snapshot.matchupHistory.push(old);
  const current = { ...old, result: "UNDECIDED" as const };
  snapshot.matchups = [current];
  assert.equal(applyResultCorrections(snapshot).matchups[0], current);
});
