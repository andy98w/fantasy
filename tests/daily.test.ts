import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBoxscore, dailyPerformers, selectPerformers } from "../lib/daily";
import { snapshotSchema } from "../lib/schema";
import { normalizeScoreboard } from "../lib/nba";
import demo from "../lib/demo.json";
import box from "./fixtures/nba-boxscore.json";
import scoreboard from "./fixtures/nba-scoreboard.json";
const game = { ...normalizeScoreboard(scoreboard, "2026-10-29")[0], id: "401909895", state: "live" as const, home: { ...normalizeScoreboard(scoreboard, "2026-10-29")[0].home, id: "22" }, away: { ...normalizeScoreboard(scoreboard, "2026-10-29")[0].away, id: "29" } };
// The public fixture carries ESPN's actual NBA team identifiers.
game.home.id = box.boxscore.players[1].team.id;
game.away.id = box.boxscore.players[0].team.id;
test("daily parser matches by stat keys, preserves zero stats and skips DNPs", () => {
  const rows = normalizeBoxscore(box, game);
  assert.equal(rows[0].stats.PTS, 14);
  assert.equal(rows[0].stats.FGM, 6);
  assert.equal(rows[0].stats.FTA, 0);
  const bad = structuredClone(box);
  bad.boxscore.players[0].statistics[0].athletes[0].didNotPlay = true;
  assert.equal(normalizeBoxscore(bad, game).length, rows.length - 1);
  bad.header.id = "wrong";
  assert.throws(() => normalizeBoxscore(bad, game));
  const missing = structuredClone(box);
  missing.boxscore.players[0].statistics[0].athletes[0].stats[1] = "--";
  assert.throws(() => normalizeBoxscore(missing, game));
});
test("daily value uses 9-cat production, shooting volume and inverted turnovers", () => {
  const data = snapshotSchema.parse(demo);
  const line = normalizeBoxscore(box, game)[0];
  const player = { ...data.players[0], id: line.playerId, teamId: 1, slot: "PG", gamesPlayed: 5 };
  data.players.push(player);
  const result = dailyPerformers(data, [line], [game]);
  assert.equal(result.length, 1);
  const worse = dailyPerformers(data, [{...line, stats:{...line.stats,TO:line.stats.TO+10,FGA:line.stats.FGA+10}}], [game]);
  assert.ok(worse[0].score < result[0].score);
  data.players.at(-1)!.gamesPlayed = 1;
  assert.equal(dailyPerformers(data, [line], [game])[0].delta, null);
  data.players.at(-1)!.slot = "IR";
  assert.equal(dailyPerformers(data, [line], [game]).length, 0);
});
test("unfinished games and tiny-minute appearances are never shamed; surprise requires a positive delta", () => {
  const data = snapshotSchema.parse(demo), line = normalizeBoxscore(box, game)[0];
  data.players.push({...data.players[0],id:line.playerId,teamId:1,slot:"PG"});
  const row = dailyPerformers(data,[line],[game])[0];
  assert.equal(selectPerformers([{...row,delta:-20}],"worst").length,0);
  assert.equal(selectPerformers([{...row,delta:-20}],"letdown").length,0);
  assert.equal(selectPerformers([{...row,delta:-20}],"surprise").length,0);
  const final = {...row,game:{...game,state:"final" as const},delta:-20};
  assert.equal(selectPerformers([final],"letdown").length,1);
  assert.equal(selectPerformers([{...final,line:{...line,minutes:2}}],"worst").length,0);
});

test("worst requires the historical cutoff while letdowns still use personal expectations", () => {
  const data = snapshotSchema.parse(demo), line = normalizeBoxscore(box,game)[0];
  data.players.push({...data.players[0],id:line.playerId,teamId:1,slot:"PG"});
  const row = {...dailyPerformers(data,[line],[game])[0],game:{...game,state:"final" as const},worstCutoff:-7};
  assert.equal(selectPerformers([{...row,score:-6,delta:-20}],"worst").length,0);
  assert.equal(selectPerformers([{...row,score:-6,delta:-20}],"letdown").length,1);
  assert.equal(selectPerformers([{...row,score:-8,delta:1}],"worst").length,1);
  assert.equal(selectPerformers([{...row,score:-8,delta:1}],"letdown").length,0);
  assert.equal(selectPerformers([{...row,score:1,worstCutoff:2}],"worst").length,0);
  assert.equal(selectPerformers([{...row,score:-30,worstCutoff:null}],"worst").length,0);
  assert.equal(selectPerformers(Array.from({length:10},(_,i)=>({...row,score:-8-i})),"worst").length,6);
});

test("calibration excludes its own dates and expires; negative reasons reflect actual category impact", async () => {
  const {calibrationCutoff,performanceNegatives}=await import("../lib/daily");
  const calibration={version:"daily-history-v1" as const,from:"2026-10-20",to:"2026-10-31",sampleSize:1120,gameCount:88,dayCount:12,percentile:.1 as const,cutoff:-7,scoredAt:"2026-11-02T20:00:00Z",source:"ESPN final NBA box scores" as const};
  assert.equal(calibrationCutoff(calibration,"2026-11-01"),-7);
  assert.equal(calibrationCutoff(calibration,"2026-10-31"),null);
  assert.equal(calibrationCutoff(calibration,"2026-11-05"),null);
  const data=snapshotSchema.parse(demo),line=normalizeBoxscore(box,game)[0];
  data.players.push({...data.players[0],id:line.playerId,teamId:1,slot:"PG"});
  const row=dailyPerformers(data,[line],[game])[0];
  row.line={...line,stats:{...line.stats,FGM:5,FGA:20,STL:0,BLK:0}};
  row.categoryScores={"FG%":-5,"FT%":0,PTS:0,REB:0,AST:4,STL:-1,BLK:-1,"3PM":-.5,TO:-1};
  assert.deepEqual(performanceNegatives(row,"worst"),["5/20 FG","0 stocks"]);
  row.categoryDeltas={...row.categoryScores,"FG%":1,STL:0,BLK:0,AST:-5};
  assert.equal(performanceNegatives(row,"letdown")[0],`${line.stats.AST} AST`);
});
