import test from "node:test";
import assert from "node:assert/strict";
import { sortPlayers } from "../components/league/format";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
const sample = snapshotSchema.parse(demo).players[0];
test("player sorting keeps missing values last in either direction without changing input", () => {
  const players = [
    { ...sample, id: 1, name: "Unrated", zTotal: null },
    { ...sample, id: 2, name: "Low", zTotal: -3 },
    { ...sample, id: 3, name: "High", zTotal: 4 },
  ];
  assert.deepEqual(
    sortPlayers(players, { key: "power", descending: true }).map((p) => p.id),
    [3, 2, 1],
  );
  assert.deepEqual(
    sortPlayers(players, { key: "power", descending: false }).map((p) => p.id),
    [2, 3, 1],
  );
  assert.deepEqual(
    players.map((p) => p.id),
    [1, 2, 3],
  );
});
test("turnover sorting preserves real zero values ahead of missing values", () => {
  const players = [
    { ...sample, id: 1, stats: { TO: null } },
    { ...sample, id: 2, stats: { TO: 0 } },
    { ...sample, id: 3, stats: { TO: 2.4 } },
  ];
  assert.deepEqual(
    sortPlayers(players, { key: "TO", descending: false }).map((p) => p.id),
    [2, 3, 1],
  );
});
