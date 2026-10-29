import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema, type WeeklyPlayer } from "../lib/schema";
import { leagueAwards, weeklyMVPs, teamMVPs } from "../lib/weekly";
import demo from "../lib/demo.json";
const matchup = () => structuredClone(snapshotSchema.parse(demo).matchups[0]);
const player = (id: number, stats: Record<string, number> = {}): WeeklyPlayer => ({ playerId: id, name: `Player ${id}`, stats: {
  PTS: 20, REB: 5, AST: 5, STL: 1, BLK: 1, "3PM": 2, TO: 2, FGM: 8, FGA: 16, FTM: 2, FTA: 2, GP: 1, ...stats,
} });
const scored = (home: WeeklyPlayer[], away: WeeklyPlayer[]) => {
  const m = matchup();
  m.home.performers = home; m.away.performers = away;
  m.home.performanceComplete = m.away.performanceComplete = true;
  return m;
};
test("weekly awards preserve ties and omit incomplete categories and zero weeks", () => {
  const m = matchup();
  m.home.stats = { BLK: 8, AST: 7, REB: 10, PTS: 20, FGM: 5, FGA: 20, TO: 3 };
  m.away.stats = { BLK: 8, AST: 4, REB: 20, PTS: 20, FGM: 4, FGA: 10, TO: 6 };
  const awards = leagueAwards([m]);
  assert.deepEqual(awards.find(a => a.stat === "BLK")?.teamIds, [m.home.teamId, m.away.teamId]);
  assert.equal(awards.find(a => a.stat === "MISSES")?.value, 15);
  assert.deepEqual(awards.find(a => a.stat === "TO")?.teamIds, [m.away.teamId]);
  delete m.away.stats.PTS;
  assert.equal(leagueAwards([m]).some(a => a.stat === "PTS"), false);
  m.home.stats = m.away.stats = { BLK: 0, AST: 0, REB: 0, PTS: 0, FGM: 0, FGA: 0, TO: 0 };
  assert.deepEqual(leagueAwards([m]), []);
  assert.deepEqual(leagueAwards([m, m]), []);
});
test("weekly MVP uses scored totals, inverses turnovers, and retains ties", () => {
  const m = scored([player(1, { TO: 1 }), player(2, { TO: 1 })], [player(3, { TO: 5 })]);
  const ratings = weeklyMVPs([m]);
  assert.ok(ratings[0].score > ratings[2].score);
  assert.ok(ratings[0].contributions.TO > 0);
  assert.deepEqual(teamMVPs(ratings, m.id, m.home.teamId).map(p => p.player.playerId), [1, 2]);
  assert.equal(ratings[0].contributions.PTS, 0); // identical category: zero variance
  m.home.performers[0].stats.PTS = 100;
  assert.equal(teamMVPs(weeklyMVPs([m]), m.id, m.home.teamId)[0].player.playerId, 1);
});
test("shooting contribution accounts for attempts rather than raw percentage", () => {
  const m = scored([player(1, { FGM: 1, FGA: 1 }), player(2, { FGM: 9, FGA: 10 })], [player(3, { FGM: 0, FGA: 10 })]);
  const ratings = weeklyMVPs([m]);
  assert.ok(ratings[1].contributions["FG%"] > ratings[0].contributions["FG%"]);
});
test("MVP excludes zero-game players and refuses incomplete weekly coverage", () => {
  const m = scored([player(1), player(2, { GP: 0, PTS: 1000 })], [player(3)]);
  assert.equal(weeklyMVPs([m]).length, 2);
  m.away.performanceComplete = false;
  assert.deepEqual(weeklyMVPs([m]), []);
});

test("finished clashes stop struggling and territory follows the category winner", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MatchupClash } = await import("../components/league/matchup-clash");
  const final = renderToStaticMarkup(createElement(MatchupClash, { home: 3, away: 6, finished: true }));
  assert.match(final, /data-active="false"/);
  assert.match(final, /data-winner="away"/);
  const turnovers = renderToStaticMarkup(createElement(MatchupClash, { home: 10, away: 30, lowerWins: true, finished: true }));
  assert.match(turnovers, /data-winner="home"/);
  assert.match(turnovers, /75%/);
  const pending = renderToStaticMarkup(createElement(MatchupClash, { home: null, away: null }));
  assert.match(pending, /data-active="false"/);
});
