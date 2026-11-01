import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { snapshotSchema, type Player, type ForecastSchedule } from "../lib/schema";
import { dailyLineup, projectTeam, scheduledOpponent, forecastScore } from "../lib/forecast";
import { Forecast } from "../components/league/forecast";
import { normalizeScoreboard, type TodayData } from "../lib/nba";
import demo from "../lib/demo.json";
import board from "./fixtures/nba-scoreboard.json";
const base = snapshotSchema.parse(demo);
const stats = { PTS: 20, REB: 5, AST: 4, STL: 1, BLK: 1, "3PM": 2, TO: 2, FGM: 5, FGA: 10, FTM: 4, FTA: 5 };
const player = (id: number, changes: Partial<Player> = {}): Player => ({ ...base.players[0], id, teamId: 1, name: `Player ${id}`, slot: "PG", eligibleSlots: ["PG", "UTIL"], status: "ACTIVE", gamesPlayed: 5, nbaTeam: "ATL", stats, zTotal: id, ...changes });
const schedule: ForecastSchedule = {
  lineupDate: "2026-10-29", slots: ["PG", "UTIL"],
  windows: [{period: 2, start: "2026-10-26", end: "2026-11-01"}, {period: 3, start: "2026-11-02", end: "2026-11-08"}],
  games: [
    {id:"1",startsAt:"2026-10-30T00:00:00Z",date:"2026-10-29",home:"ATL",away:"BOS",scoringPeriod:10},
    {id:"2",startsAt:"2026-11-03T01:00:00Z",date:"2026-11-02",home:"ATL",away:"BOS",scoringPeriod:14},
    {id:"3",startsAt:"2026-11-05T01:00:00Z",date:"2026-11-04",home:"ATL",away:"BOS",scoringPeriod:16},
  ], pairs: [{period:3,home:1,away:2}],
};
const now = Date.parse("2026-10-29T22:00:00Z");
function snapshot(players: Player[]) { return {...base, league:{...base.league,matchupPeriod:2}, forecastSchedule:structuredClone(schedule), players}; }

test("legal lineup matching preserves scarce positions and fills slots even with negative power", () => {
  const p = [player(1,{eligibleSlots:["PG","SG"],zTotal:10}),player(2,{eligibleSlots:["PG"],zTotal:-5}),player(3,{eligibleSlots:["SG"],zTotal:-10})];
  assert.deepEqual(dailyLineup(p,["PG","SG"]).map(p=>p.id).sort(),[1,2]);
  assert.equal(dailyLineup(p,["C"]).length,0);
  assert.equal(dailyLineup(p,Array(13).fill("UTIL")).length,0);
});

test("future forecasts count playable games, bench overflow, exclude IR/out, and weight shooting", () => {
  const d=snapshot([player(1),player(2,{stats:{...stats,FGM:9,FGA:30},slot:"BE"}),player(3,{slot:"IR",zTotal:100}),player(4,{status:"OUT",zTotal:200}),player(5,{zTotal:-10})]);
  const p=projectTeam(d,1,schedule.windows[1],now);
  assert.equal(p.issue,null); assert.equal(p.games,4); assert.equal(p.benched,2);
  assert.equal(p.side.stats.PTS,80); assert.equal(p.side.stats["FG%"],.35);
  assert.deepEqual(p.excluded.map(p=>p.id),[3,4]);
  assert.equal(scheduledOpponent(schedule,3,1),2);
  assert.equal(scheduledOpponent(schedule,3,2),1);
  assert.equal(scheduledOpponent(schedule,2,1),undefined);
});

test("missing baselines or unsupported schedules never become zero-value forecasts", () => {
  const d=snapshot([player(1,{gamesPlayed:0})]);
  const p=projectTeam(d,1,schedule.windows[1],now);
  assert.equal(p.missing[0].id,1); assert.ok(p.issue); assert.equal(forecastScore(p,p),null);
  assert.deepEqual(p.side.stats,{});
  assert.ok(projectTeam({...d,forecastSchedule:null},1,schedule.windows[1],now).issue);
  assert.ok(projectTeam(d,1,schedule.windows[0],Date.parse("2026-11-03T00:00:00Z")).issue);
});

test("current week adds actual totals and only remaining live production; started bench stays benched", () => {
  const d=snapshot([player(1),player(2,{slot:"BE"})]);
  d.forecastSchedule.slots=["PG"];
  d.matchups=[{id:1,period:2,result:"UNDECIDED",home:{teamId:1,wins:0,ties:0,stats:{...stats,PTS:100},performers:[],performanceComplete:false},away:{teamId:2,wins:0,ties:0,stats,performers:[],performanceComplete:false}}];
  const time=Date.parse("2026-10-30T01:00:00Z");
  d.syncedAt=new Date(time).toISOString();
  const today: TodayData={date:"2026-10-29",fetchedAt:new Date(time).toISOString(),status:"ready",games:[{id:"1",startsAt:schedule.games[0].startsAt,state:"live",detail:"Halftime",remainingFraction:.5,home:{id:"1",name:"Atlanta",abbrev:"ATL",score:50,logo:null},away:{id:"2",name:"Boston",abbrev:"BOS",score:50,logo:null}}]};
  const p=projectTeam(d,1,schedule.windows[0],time,today);
  assert.equal(p.issue,null);assert.equal(p.side.stats.PTS,110);assert.equal(p.games,0);assert.equal(p.liveGames,1);
  today.games[0].state="final";today.games[0].remainingFraction=0;
  assert.equal(projectTeam(d,1,schedule.windows[0],time,today).side.stats.PTS,100);
  today.status="stale";
  assert.ok(projectTeam(d,1,schedule.windows[0],time,today).issue);
});

test("unstarted games can use only unlocked slots and postponed games are skipped", () => {
  const d=snapshot([player(1),player(2,{slot:"BE",nbaTeam:"LAL"})]);
  d.forecastSchedule.slots=["PG"];
  d.forecastSchedule.games.push({...schedule.games[0],id:"4",startsAt:"2026-10-30T04:00:00Z",home:"LAL",away:"NYK"});
  d.matchups=[{id:1,period:2,result:"UNDECIDED",home:{teamId:1,wins:0,ties:0,stats,performers:[],performanceComplete:false},away:{teamId:2,wins:0,ties:0,stats,performers:[],performanceComplete:false}}];
  const time=Date.parse("2026-10-30T03:00:00Z");
  d.syncedAt=new Date(time).toISOString();
  const today:TodayData={date:"2026-10-29",fetchedAt:new Date(time).toISOString(),status:"ready",games:[{id:"1",startsAt:schedule.games[0].startsAt,state:"final",detail:"Final",remainingFraction:0,home:{id:"1",abbrev:"ATL",name:"A",score:0,logo:null},away:{id:"2",abbrev:"BOS",name:"B",score:0,logo:null}}]};
  const p=projectTeam(d,1,schedule.windows[0],time,today);
  assert.equal(p.games,0);assert.equal(p.benched,1);assert.equal(p.side.stats.PTS,20);
  assert.equal(p.days[0].lockedSlots, 1); assert.deepEqual(p.days[0].openSlots, []);
  assert.deepEqual(p.days[0].benchedPlayerIds, [2]);
  today.games[0].state="postponed";
  assert.equal(projectTeam(d,1,schedule.windows[0],time,today).games,1);
});

test("live clock yields remaining regulation fraction and never invents unknown clocks", () => {
  const payload=structuredClone(board);
  const status=payload.events[0].competitions[0].status as unknown as Record<string,unknown>;
  status.type={name:"STATUS_IN_PROGRESS",state:"in",completed:false};status.period=3;status.clock=360;
  const g=normalizeScoreboard(payload,"2026-10-29")[0];assert.equal(g.remainingFraction,.375);
  delete status.clock;assert.equal(normalizeScoreboard(payload,"2026-10-29")[0].remainingFraction,null);
});

test("forecast page labels projections and uses one collapsed assumptions section", () => {
  const d=snapshot([player(1),player(2,{teamId:2})]);
  const html=renderToStaticMarkup(createElement(Forecast,{data:d}));
  assert.match(html,/Next week/);assert.match(html,/Rest of this week/);assert.match(html,/Projected/);assert.match(html,/Forecast assumptions/);
  assert.doesNotMatch(html,/<details[^>]*open/);
});

test("optional malformed forecast metadata cannot hide an otherwise valid league", () => {
  assert.equal(snapshotSchema.parse({...demo,forecastSchedule:{slots:[]}}).forecastSchedule,null);
});

 test("opportunities preserve usable slots with positional constraints", () => {
  const d = snapshot([player(1, { eligibleSlots: ["PG"] })]);
  const p = projectTeam(d, 1, schedule.windows[1], now);
  assert.equal(p.issue, null);
  assert.deepEqual(p.days.map(day => day.openSlots), [["UTIL"], ["UTIL"]]);
  assert.deepEqual(p.days[0].selectedPlayerIds, [1]);
});
