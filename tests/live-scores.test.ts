import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import { mergeLiveScores } from "../lib/live-scores";
import demo from "../lib/demo.json";
test("only a newer, complete, same-period scoreboard overlays a saved import", () => {
  const s = snapshotSchema.parse(demo), now = Date.parse(s.syncedAt) + 60_000;
  const feed = { leagueId:s.league.id, season:s.league.season, period:s.league.matchupPeriod, fetchedAt:new Date(now).toISOString(),matchups:structuredClone(s.matchups) };
  feed.matchups[0].home.wins = 9;
  assert.equal(mergeLiveScores(s,feed,now).matchups[0].home.wins,9);
  assert.equal(mergeLiveScores(s,feed,now).syncedAt,s.syncedAt);
  for (const bad of [{...feed,period:99},{...feed,leagueId:1},{...feed,season:1},{...feed,matchups:[]},{...feed,fetchedAt:s.syncedAt},{...feed,matchups:feed.matchups.map(m=>({...m,id:1}))}]) assert.equal(mergeLiveScores(s,bad,now),s);
  assert.equal(mergeLiveScores(s,feed,now+16*60_000),s);
});
