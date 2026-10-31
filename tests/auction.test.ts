import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalAuctionStore } from "../lib/auction-store";
import { auctionMutationSchema, auctionScope, canListPlayer, currentListings, ListingConflict } from "../lib/auction";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
const data = snapshotSchema.parse(demo);
const player = data.players.find(p => p.teamId !== null)!;
const input = { action: "save" as const, teamId: player.teamId!, playerId: player.id, note: "Looking for assists", version: 0 };

test("auction validates roster ownership, notes and league/season boundaries", () => {
  assert.ok(auctionMutationSchema.safeParse(input).success);
  assert.equal(auctionMutationSchema.safeParse({ ...input, note: "x".repeat(241) }).success, false);
  assert.equal(auctionMutationSchema.safeParse({ ...input, version: -1 }).success, false);
  assert.equal(canListPlayer(data, 999999, player.id), false);
  assert.ok(canListPlayer(data, player.teamId!, player.id));
  assert.equal(canListPlayer(data, player.teamId!, 999999999), false);
  assert.notEqual(auctionScope(data), auctionScope({ ...data, league: { ...data.league, season: data.league.season + 1 } }));
});
test("listings persist across connections; retries, concurrent edits, removal and relisting are safe", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auction-test-"));
  const a = new LocalAuctionStore(path.join(dir, "auction.sqlite"));
  const b = new LocalAuctionStore(path.join(dir, "auction.sqlite"));
  try {
    const saved = a.mutate("league", input);
    assert.deepEqual(b.list("league"), [saved]);
    assert.deepEqual(b.mutate("league", input), saved);
    assert.throws(() => b.mutate("league", { ...input, note: "stale overwrite" }), ListingConflict);
    const edited = b.mutate("league", { ...input, version: 1, note: "Blocks" });
    assert.equal(edited.version, 2);
    assert.throws(() => a.mutate("league", { ...input, version: 1, action: "close" }), ListingConflict);
    assert.throws(() => a.mutate("league", { ...input, teamId: 999, version: 2, action: "close" }), ListingConflict);
    const closed = a.mutate("league", { ...input, version: 2, action: "close" });
    assert.equal(closed.active, false);
    assert.deepEqual(currentListings(a.list("league"), data), []);
    const relisted = b.mutate("league", { ...input, version: 3, note: "" });
    assert.equal(relisted.active, true);
    assert.equal(a.list("league").length, 1);
    assert.equal(currentListings(a.list("league"), data).length, 1);
    const moved = { ...data, players: data.players.map(p => p.id === player.id ? { ...p, teamId: null } : p) };
    assert.deepEqual(currentListings(a.list("league"), moved), []);
    assert.deepEqual(a.list("other-league"), []);
  } finally { a.close(); b.close(); rmSync(dir, { recursive: true }); }
});
