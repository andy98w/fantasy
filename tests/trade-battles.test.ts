import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalBattleStore, VoteConflict } from "../lib/battle-store";
import { chooseBattle, elo, rankEntries, tradeEntries, validBattle, voteSchema, type BattleVote } from "../lib/trade-battles";
const trades = [
  { id: "a", completedAt: "2026-10-01T12:00:00Z", moves: [{playerId: 1, fromTeamId: 1, toTeamId: 2}, {playerId: 2, fromTeamId: 2, toTeamId: 1}] },
  { id: "b", completedAt: "2026-10-02T12:00:00Z", moves: [{playerId: 3, fromTeamId: 2, toTeamId: 3}, {playerId: 4, fromTeamId: 3, toTeamId: 2}] },
];
const entries = tradeEntries(trades);
const vote = (): BattleVote => ({ requestId: randomUUID(), mode: "best", leftId: "a:1", rightId: "b:2", winnerId: "a:1" });
test("battle sides preserve sent/received and only compare different actual trades", () => {
  assert.deepEqual(entries[0].sent, [1]); assert.deepEqual(entries[0].received, [2]);
  assert.equal(validBattle(vote(), entries), true);
  assert.equal(validBattle({...vote(),rightId:"a:2"},entries),false);
  assert.equal(validBattle({...vote(),winnerId:"b:3"},entries),false);
  assert.equal(validBattle({...vote(),leftId:"missing"},entries),false);
  assert.equal(chooseBattle(entries.slice(0,2)),null);
  for (let n=0;n<50;n++) { const pair=chooseBattle(entries)!; assert.notEqual(pair[0].split(":")[0], pair[1].split(":")[0]); }
  assert.equal(voteSchema.safeParse({...vote(), rating:999999}).success,false);
  assert.equal(voteSchema.safeParse({...vote(), mode:"worst"}).success,false);
  const { mode, ...singleVote } = vote();
  assert.equal(voteSchema.parse(singleVote).mode,"best");
});
test("Elo preserves points and rewards an upset more than an expected win", () => {
  assert.deepEqual(elo(1000,1000), {winner:1016,loser:984,delta:16});
  assert.ok(elo(800,1200).delta > elo(1200,800).delta);
  assert.equal(elo(800,1200).winner + elo(800,1200).loser,2000);
});
test("votes persist across reopen, repeats count, retry IDs count once, leagues and seasons stay separate", () => {
  const dir = mkdtempSync(path.join(tmpdir(),"fantasy-battles-"));
  const file = path.join(dir,"votes.sqlite");
  let store = new LocalBattleStore(file);
  try {
    const first=vote(); const result=store.vote("live:1:2027",first);
    assert.equal(result.delta,16);
    assert.deepEqual(store.vote("live:1:2027",first),result);
    assert.throws(()=>store.vote("live:1:2027",{...first,winnerId:first.rightId}),VoteConflict);
    store.vote("live:1:2027",vote());
    const rows=store.ratings("live:1:2027","best");
    assert.equal(rows.find(r=>r.entryId==="a:1")!.votes,2);
    assert.equal(rows.find(r=>r.entryId==="a:1")!.wins,2);
    assert.equal(rows.reduce((sum,r)=>sum+r.rating,0),2000);
    assert.equal(store.ratings("live:1:2028","best").length,0);
    assert.equal(store.ratings("demo:1:2027","best").length,0);
    store.vote("live:1:2028",vote());
    assert.equal(store.ratings("live:1:2028","best")[0].votes,1);
    store.close(); store = new LocalBattleStore(file);
    assert.equal(store.ratings("live:1:2027","best")[0].votes,2);
  } finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});
test("equal displayed MMR shares rank and unvoted entries have no rank", () => {
  const ranked=rankEntries(entries,[{entryId:"a:1",rating:1016.1,votes:1,wins:1},{entryId:"a:2",rating:1016.2,votes:1,wins:1}]);
  assert.deepEqual(ranked.map(r=>r.rank),[1,1,null,null]);
});
