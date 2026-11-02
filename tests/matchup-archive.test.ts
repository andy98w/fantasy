import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import demo from "../lib/demo.json";
import { CATEGORIES, snapshotSchema, type Matchup } from "../lib/schema";
import { archiveScore, matchupArchive } from "../lib/matchup-archive";
import { applyResultCorrections } from "../lib/result-corrections";
import { MatchupArchive } from "../components/league/matchup-archive";

function fixture() {
  const s = snapshotSchema.parse(demo);
  s.league.matchupPeriod = 2;
  s.matchups = []; s.matchupHistory = [];
  s.forecastSchedule = { lineupDate: "2026-11-01", windows: [], games: [], slots: ["PG"], pairs: [] };
  return s;
}
function match(id: number, period: number, result: Matchup["result"] = "UNDECIDED"): Matchup {
  const side = (teamId: number) => ({ teamId, wins: null, ties: null, stats: {}, performers: [], performanceComplete: false });
  return { id, period, result, home: side(8), away: side(7) };
}
test("archive retains pending history and takes fresh scores over retained copies", () => {
  const s = fixture();
  s.matchupHistory = [match(1, 1), match(2, 2, "HOME")];
  s.matchups = [match(2, 2)];
  const archive = matchupArchive(s);
  assert.equal(archive.entries.length, 2);
  assert.deepEqual(archive.entries.map(row => row.state), ["Result pending", "In progress"]);
  assert.equal(archive.entries[1].match, s.matchups[0]);
});
test("only imported future pairings appear and reverse home/away does not duplicate a matchup", () => {
  const s = fixture(); s.matchups = [match(2, 2)];
  s.forecastSchedule!.pairs = [{ period: 2, home: 7, away: 8 }, { period: 3, home: 7, away: 8 }];
  const archive = matchupArchive(s);
  assert.deepEqual(archive.periods, [1, 2, 3]);
  assert.equal(archive.entries.length, 2);
  assert.equal(archive.entries[1].state, "Scheduled");
  assert.deepEqual(archiveScore(archive.entries[1]), { home: "—", away: "—", ties: null, categoryTotals: false });
  const html = renderToStaticMarkup(createElement(MatchupArchive, { data: { ...s, league: { ...s.league, matchupPeriod: 3 } } }));
  assert.match(html, /Scores for this matchup have not been imported/);
});
test("confirmed Week 1 outcomes display wins and losses without invented category scores", () => {
  const s = fixture(); s.mode = "live";
  Object.assign(s.league, { id: 1834203755, season: 2027, scoringType: "H2H_MOST_CATEGORIES" });
  const corrected = applyResultCorrections(s);
  const rows = matchupArchive(corrected).entries.filter(row => row.period === 1);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.state === "Final" && !archiveScore(row).categoryTotals));
  assert.ok(rows.every(row => new Set([archiveScore(row).home, archiveScore(row).away]).size === 2));
  assert.deepEqual(new Set(rows.flatMap(row => [archiveScore(row).home, archiveScore(row).away])), new Set(["W", "L"]));
});
test("category scoring inverts turnovers, keeps ties, and refuses a partial score", () => {
  const s = fixture(), m = match(2, 2);
  m.home.stats = Object.fromEntries(CATEGORIES.map(c => [c, 10]));
  m.away.stats = Object.fromEntries(CATEGORIES.map(c => [c, 5]));
  m.away.stats.AST = 10; s.matchups = [m];
  assert.deepEqual(archiveScore(matchupArchive(s).entries[0]), { home: "7", away: "1", ties: 1, categoryTotals: true });
  delete m.home.stats.PTS;
  assert.deepEqual(archiveScore(matchupArchive(s).entries[0]), { home: "—", away: "—", ties: null, categoryTotals: false });
  m.result = "TIE";
  assert.deepEqual(archiveScore(matchupArchive(s).entries[0]), { home: "T", away: "T", ties: null, categoryTotals: false });
});
test("missing weeks remain selectable with an explicit empty state", () => {
  const s = fixture(); s.league.matchupPeriod = 4;
  assert.deepEqual(matchupArchive(s).periods, [1, 2, 3, 4]);
  const html = renderToStaticMarkup(createElement(MatchupArchive, { data: s }));
  assert.match(html, /No matchups have been imported for Week 4/);
});
test("archive reads corrected Week 2 totals and exposes Monday provenance", () => {
  const s = fixture(); s.mode = "live";
  Object.assign(s.league, { id: 1834203755, season: 2027, scoringType: "H2H_MOST_CATEGORIES" });
  const m = match(7, 2);
  m.home.stats = { ...Object.fromEntries(CATEGORIES.map(c => [c, 10])), FGM: 20, FGA: 50, FTM: 10, FTA: 20 };
  m.away.stats = { ...m.home.stats }; s.matchups = [m];
  const corrected = applyResultCorrections(s);
  const row = matchupArchive(corrected).entries.find(row => row.period === 2)!;
  assert.equal(row.match!.home.stats.PTS, 35);
  assert.equal(row.match!.home.stats["FG%"], 30 / 75);
  assert.equal(archiveScore(row).categoryTotals, true);
  const html = renderToStaticMarkup(createElement(MatchupArchive, { data: corrected }));
  assert.match(html, /restored 2026-10-26 totals/);
  assert.match(html, /In progress/);
});
