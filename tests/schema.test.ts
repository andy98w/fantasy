import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
test("demo snapshot is valid and explicitly fictional", () => {
  const parsed = snapshotSchema.parse(demo);
  assert.equal(parsed.mode, "demo");
  assert.equal(
    new Set(parsed.players.map((p) => p.id)).size,
    parsed.players.length,
  );
  assert.equal(
    parsed.players.filter((p) => p.teamId !== null).length,
    parsed.coverage.rosteredCount,
  );
});
test("invalid stats and executable news URLs are rejected", () => {
  const bad = structuredClone(demo);
  bad.players[0].stats.PTS = Infinity;
  assert.equal(snapshotSchema.safeParse(bad).success, false);
  assert.equal(
    snapshotSchema.safeParse({
      ...demo,
      news: [
        {
          id: "1",
          source: "bad",
          title: "bad",
          url: "javascript:alert(1)",
          publishedAt: null,
          playerIds: [],
        },
      ],
    }).success,
    false,
  );
});
