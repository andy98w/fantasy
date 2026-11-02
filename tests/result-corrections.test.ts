import test from "node:test";
import assert from "node:assert/strict";
import demo from "../lib/demo.json";
import { snapshotSchema } from "../lib/schema";
import { applyResultCorrections } from "../lib/result-corrections";
import { allPlay, leagueRecords, rivalry, seasonMatchups } from "../lib/season";
import { CATEGORIES } from "../lib/schema";
import { mergeLiveScores } from "../lib/live-scores";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryComparison } from "../components/league/category-comparison";

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

function weekTwoFixture() {
  const s = applyResultCorrections(fixture());
  const homeStats = { TO:68, "3PM":79, AST:143, BLK:26, "FG%":226/489, FGA:489, FGM:226,
    "FT%":133/163, FTA:163, FTM:133, PTS:664, REB:245, STL:40 };
  const awayStats = { TO:102, "3PM":54, AST:168, BLK:27, "FG%":253/518, FGA:518, FGM:253,
    "FT%":123/147, FTA:147, FTM:123, PTS:683, REB:212, STL:55 };
  s.matchups = [{ id:7, period:2, result:"UNDECIDED", home:{teamId:8,wins:3,ties:0,stats:homeStats,
    performers:[{playerId:123,name:"Existing credited player",stats:{PTS:20}}],performanceComplete:true},
    away:{teamId:7,wins:6,ties:0,stats:awayStats,performers:[],performanceComplete:true} }];
  return s;
}

test("missing Monday is appended only to Broke Young Boys Week 2 with pooled shooting rates", () => {
  const source=weekTwoFixture(), original=structuredClone(source);
  const result=applyResultCorrections(source), match=result.matchups[0];
  assert.deepEqual(match.home.stats,{TO:75,"3PM":80,AST:146,BLK:27,"FG%":236/514,FGA:514,FGM:236,
    "FT%":137/167,FTA:167,FTM:137,PTS:689,REB:260,STL:43});
  assert.deepEqual(match.away.stats,source.matchups[0].away.stats);
  assert.deepEqual([match.home.wins,match.away.wins,match.home.ties,match.away.ties],[4,4,1,1]);
  assert.equal(match.result,"UNDECIDED");
  assert.deepEqual(result.teams,source.teams); assert.deepEqual(result.players,source.players);
  assert.deepEqual(result.matchupHistory,source.matchupHistory); assert.deepEqual(source,original);
  assert.deepEqual(match.home.performers,source.matchups[0].home.performers);
  assert.equal(match.home.performanceComplete,false); assert.equal(match.away.performanceComplete,true);
  assert.equal(match.home.statCorrections?.[0].date,"2026-10-26");
});

test("Monday provenance survives serialization and prevents repeated additions", () => {
  const source=weekTwoFixture(), corrected=applyResultCorrections(source);
  assert.deepEqual(applyResultCorrections(corrected),corrected);
  const restored=snapshotSchema.parse(JSON.parse(JSON.stringify(corrected)));
  assert.deepEqual(applyResultCorrections(restored),restored);
  assert.deepEqual(applyResultCorrections(source),corrected);
  assert.equal(restored.matchups[0].home.statCorrections?.length,1);
});

test("Monday restoration remains in completed history and adjusts only the changed result", () => {
  const s=weekTwoFixture();
  s.league.matchupPeriod=3;
  s.matchups[0].result="AWAY";
  s.matchupHistory.push(structuredClone(s.matchups[0]));s.matchups=[];
  s.teams.find(t=>t.id===8)!.losses++;
  s.teams.find(t=>t.id===7)!.wins++;
  const result=applyResultCorrections(s);
  assert.equal(result.matchupHistory.find(m=>m.id===7)!.result,"TIE");
  for(const id of [8,7]) {
    const t=result.teams.find(t=>t.id===id)!;
    assert.deepEqual([t.wins,t.losses,t.ties],[1,0,1]);
  }
  assert.deepEqual(result.teams.filter(t=>![7,8].includes(t.id)),s.teams.filter(t=>![7,8].includes(t.id)));
  assert.deepEqual(applyResultCorrections(result),result);
  assert.equal(rivalry(seasonMatchups(result),8,7).ties,1);
  assert.equal(leagueRecords(seasonMatchups(result)).find(r=>r.id==="PTS")?.value,689);
});

test("Monday restoration refuses other leagues, seasons, weeks and pairings", () => {
  for(const update of [
    (s:ReturnType<typeof weekTwoFixture>)=>{s.league.id++;},
    (s:ReturnType<typeof weekTwoFixture>)=>{s.league.season++;},
    (s:ReturnType<typeof weekTwoFixture>)=>{s.mode="demo";},
    (s:ReturnType<typeof weekTwoFixture>)=>{s.matchups[0].period=3;},
    (s:ReturnType<typeof weekTwoFixture>)=>{s.matchups[0].id=8;},
    (s:ReturnType<typeof weekTwoFixture>)=>{s.matchups[0].away.teamId=6;},
    (s:ReturnType<typeof weekTwoFixture>)=>{s.matchups[0].home.teamId=6;},
  ]) {
    const source=weekTwoFixture();update(source);
    assert.deepEqual(applyResultCorrections(source).matchups,source.matchups);
  }
});

test("missing weekly base totals remain unknown despite known Monday deltas", () => {
  const s=weekTwoFixture();s.matchups[0].home.stats.PTS=null;delete s.matchups[0].home.stats.FGA;
  const match=applyResultCorrections(s).matchups[0];
  assert.equal(match.home.stats.PTS,null);assert.equal(match.home.stats.FGA,null);assert.equal(match.home.stats["FG%"],null);
  assert.equal(match.home.stats.FGM,236);assert.equal(match.home.wins,null);assert.equal(match.away.wins,null);
});


test("fresh live scores get the Monday addition once and the UI explains restored totals", () => {
  const original=weekTwoFixture();
  const now=Date.parse(original.syncedAt)+60_000;
  const fresh=structuredClone(original.matchups);
  fresh[0].home.stats.PTS=700;
  const feed={leagueId:original.league.id,season:original.league.season,period:2,fetchedAt:new Date(now).toISOString(),matchups:fresh};
  const corrected=applyResultCorrections(mergeLiveScores(applyResultCorrections(original),feed,now));
  const match=corrected.matchups[0];
  assert.equal(match.home.stats.PTS,725);
  assert.equal(applyResultCorrections(corrected).matchups[0].home.stats.PTS,725);
  const html=renderToStaticMarkup(createElement(CategoryComparison,{home:match.home,away:match.away,homeName:"Broke Young Boys",awayName:"sheeeeshhhh"}));
  assert.match(html,/restored 2026-10-26 totals/);assert.match(html,/10\/25 FG/);assert.match(html,/not assigned to individual player rows/);
});
