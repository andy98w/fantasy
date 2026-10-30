import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, snapshotSchema, type Matchup } from "../lib/schema";
import { allPlay, compareCategories, leagueRecords, rivalry, seasonMatchups, weekSides } from "../lib/season";
import demo from "../lib/demo.json";
const data = snapshotSchema.parse(demo);
const stats = (value: number) => Object.fromEntries(CATEGORIES.map(c => [c, c === "TO" ? 20 - value : c.includes("%") ? value / 20 : value]));
function match(id: number, period: number, a: number, b: number, x = 10, y = 5, result: Matchup["result"] = "HOME"): Matchup {
  return { id, period, result, home: {teamId:a,wins:9,ties:0,stats:stats(x),performers:[],performanceComplete:false}, away: {teamId:b,wins:0,ties:0,stats:stats(y),performers:[],performanceComplete:false} };
}
test("season history deduplicates by matchup ID and latest current score wins", () => {
  const old = match(1,1,1,2), current = match(1,1,1,2,9,8,"UNDECIDED");
  const matches = seasonMatchups({matchupHistory:[old,match(2,2,1,2,5,5,"UNDECIDED")],matchups:[current]});
  assert.equal(matches.length,1);
  assert.equal(matches[0].result,"UNDECIDED");
});
test("category comparison preserves ties, inverts turnovers, and reports unknown stats", () => {
  assert.deepEqual(compareCategories(stats(10),stats(5)),{home:9,away:0,ties:0,missing:0});
  assert.deepEqual(compareCategories({TO:0},{TO:2},["TO"]),{home:1,away:0,ties:0,missing:0});
  assert.deepEqual(compareCategories({PTS:0},{PTS:0},["PTS","AST"]),{home:0,away:0,ties:1,missing:1});
});
test("all-play has one game against each other team and ties share ranks", () => {
  const teams = data.teams.slice(0,4).map((t,i)=>({...t,id:i+1}));
  const matches = [match(1,1,1,2,10,5),match(2,1,3,4,10,0)];
  const {rows,missing} = allPlay(teams,matches,1,CATEGORIES);
  assert.equal(missing.length,0);
  assert.deepEqual(rows.map(r=>[r.team.id,r.rank,r.wins,r.losses,r.ties]),[[1,1,2,0,1],[3,1,2,0,1],[2,3,1,2,0],[4,4,0,3,0]]);
  for(const row of rows) assert.equal(row.wins+row.losses+row.ties,3);
  matches[0].home.stats.TO=50;
  assert.equal(allPlay(teams,matches,1,["TO"]).rows.at(-1)!.team.id,1);
  assert.equal(allPlay(teams,matches,1,["PTS"]).rows[0].team.id,1);
  delete matches[0].home.stats.AST;
  assert.equal(allPlay(teams,matches,1,CATEGORIES).missing[0].id,1);
  assert.equal(allPlay(teams,matches,1,[]).rows.length,0);
});
test("rivalry uses ESPN finalized outcome, handles reversed home/away and excludes other teams", () => {
  const matches=[match(1,1,1,2),match(2,2,2,1),match(3,3,1,2,5,5,"TIE"),match(4,4,1,2,10,5,"UNDECIDED"),match(5,5,1,3)];
  const head=rivalry(matches,1,2);
  assert.deepEqual([head.wins,head.losses,head.ties],[1,1,1]);
  assert.deepEqual(head.meetings.map(m=>m.id),[3,2,1]);
  assert.equal(rivalry(matches,1,1).meetings.length,0);
});
test("records retain tied holders, qualify shooting volume, and detect a new high", () => {
  const a=match(1,1,1,2,10,5), b=match(2,2,3,4,20,20);
  a.home.stats={...a.home.stats,FGA:60,FGM:15,"FG%":.25};
  b.home.stats={...b.home.stats,FGA:10,FGM:1,"FG%":.1}; // too few attempts
  const records=leagueRecords([a,b]);
  const points=records.find(r=>r.id==="PTS")!;
  assert.deepEqual(points.holders.map(h=>h.teamId),[3,4]);
  assert.equal(points.newRecord,true);
  assert.equal(records.find(r=>r.id==="FG%")!.value,.25);
  assert.equal(records.find(r=>r.id==="MISSES")!.value,45);
  a.home.stats.PTS=20;
  assert.equal(leagueRecords([a,b]).find(r=>r.id==="PTS")!.newRecord,false);
});
test("streaks stop on ties or losses and exclude live games", () => {
  const matches=[match(1,1,1,2),match(2,2,1,3),match(3,3,1,4,5,5,"TIE"),match(4,4,1,2),match(5,5,1,3,10,5,"UNDECIDED")];
  const record=leagueRecords(matches).find(r=>r.id==="streak")!;
  assert.equal(record.value,2);
  assert.equal(record.holders[0].period,2);
});
test("duplicate team/week data is not used for simulated matchups", () => {
  assert.equal(weekSides([match(1,1,1,2),match(2,1,1,3)],1).has(1),false);
});

test("records default to standings and rivalries distinguish completed and live meetings", async () => {
  const {createElement}=await import("react");
  const {renderToStaticMarkup}=await import("react-dom/server");
  const {Records}=await import("../components/league/records");
  const {Rivalries}=await import("../components/league/rivalries");
  const a=data.teams[0].id,b=data.teams[1].id;
  const snapshot={...data,matchupHistory:[match(100,1,a,b)],matchups:[match(101,2,a,b,8,7,"UNDECIDED")]};
  const records=renderToStaticMarkup(createElement(Records,{data:snapshot}));
  assert.match(records,/aria-pressed="true">Standings/);
  assert.match(records,/aria-label="League standings"/);
  const rivals=renderToStaticMarkup(createElement(Rivalries,{data:snapshot}));
  assert.match(rivals,/Closest/);
  assert.match(rivals,/1–0/);
  assert.match(rivals,/Week 2 · Live/);
});
