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

function seededRandom(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const selectionEntries = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `deal-${i}:1`, tradeId: `deal-${i}`, teamId: 1, completedAt: trades[0].completedAt, received: [1], sent: [2],
}));
test("low-vote deals appear more often without excluding established deals", () => {
  const pool = selectionEntries(8), random = seededRandom();
  const ratings = pool.map((entry, i) => ({ entryId: entry.id, rating: 1000, votes: i < 2 ? 0 : 100, wins: 0 }));
  const appearances = new Map(pool.map(entry => [entry.id, 0]));
  for (let i = 0; i < 12000; i++) {
    for (const id of chooseBattle(pool, { ratings, random })!) appearances.set(id, appearances.get(id)! + 1);
  }
  const low = pool.slice(0, 2).reduce((sum, entry) => sum + appearances.get(entry.id)!, 0) / 2;
  const established = pool.slice(2).reduce((sum, entry) => sum + appearances.get(entry.id)!, 0) / 6;
  assert.ok(low > established * 2, `Low-vote appearances ${low}, established ${established}`);
  for (const count of appearances.values()) assert.ok(count > 500, "Every deal retains a meaningful chance");
});
test("similar MMR opponents are favored while cross-rating battles remain possible", () => {
  const pool = selectionEntries(8), random = seededRandom(7);
  const ratings = pool.map((entry, i) => ({ entryId: entry.id, rating: i < 4 ? 800 : 1600, votes: 10, wins: 5 }));
  const group = new Map(ratings.map(row => [row.entryId, row.rating]));
  let close = 0, distant = 0, leftLow = 0;
  for (let i = 0; i < 12000; i++) {
    const pair = chooseBattle(pool, { ratings, random })!;
    if (group.get(pair[0]) === group.get(pair[1])) close++; else distant++;
    if (group.get(pair[0]) === 800) leftLow++;
  }
  assert.ok(close > distant * 3);
  assert.ok(distant > 800, "Exploration still compares distant ratings");
  assert.ok(leftLow > 5400 && leftLow < 6600, "Presentation does not favor one side");
});
test("repeat avoidance rotates actual trades, handles small pools and ignores removed history", () => {
  const pool = tradeEntries([...trades, ...trades.map(t => ({ ...t, id: `new-${t.id}` }))]);
  const random = seededRandom();
  const previous: [string, string] = ["a:1", "b:2"];
  for (let i = 0; i < 100; i++) {
    const pair = chooseBattle(pool, { previous, recent: [previous], random })!;
    assert.ok(pair.every(id => id.startsWith("new-")), "Do not just swap to the other side of the same trade");
    const small = chooseBattle(entries, { previous, random })!;
    assert.ok(!small.every(id => previous.includes(id)), "Avoid the same pair when another pair exists");
    assert.notEqual(small[0].split(":")[0], small[1].split(":")[0]);
  }
  const minimal = [entries[0], entries[2]];
  assert.deepEqual(new Set(chooseBattle(minimal, { previous, random })!), new Set(previous));
  assert.equal(chooseBattle([], { previous, random }), null);
  assert.equal(chooseBattle(entries.slice(0, 2), { previous, random }), null);
  assert.ok(chooseBattle(pool, { previous: ["removed:1", "removed:2"], random }));
});
test("recently shown trades get a soft cooldown and missing ratings start at zero votes", () => {
  const pool = selectionEntries(6), random = seededRandom(16);
  let recent = 0, fresh = 0;
  for (let i = 0; i < 8000; i++) {
    const pair = chooseBattle(pool, { recent: [[pool[0].id, pool[1].id]], random })!;
    for (const id of pair) if (id === pool[0].id || id === pool[1].id) recent++; else fresh++;
  }
  assert.ok(fresh / 4 > recent / 2 * 1.3);
  assert.ok(recent > 1000, "Cooldown does not permanently exclude deals");
  const unrated = chooseBattle(pool, { random: seededRandom(24) });
  const defaults = chooseBattle(pool, { ratings: pool.map(entry => ({ entryId: entry.id, rating: 1000, votes: 0, wins: 0 })), random: seededRandom(24) });
  assert.deepEqual(unrated, defaults);
});
