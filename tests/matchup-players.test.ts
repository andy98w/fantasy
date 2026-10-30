import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import { matchupPlayers, sortMatchupPlayers } from "../lib/matchup-players";
import demo from "../lib/demo.json";

test("weekly rows retain credited team after a trade and never substitute season averages", () => {
  const snapshot = snapshotSchema.parse(demo);
  const matchup = snapshot.matchups[0];
  const traded = { ...snapshot.players[0], teamId: matchup.away.teamId, stats: { PTS: 999 } };
  matchup.home.performers = [{ playerId: traded.id, name: traded.name, stats: { PTS: 12, GP: 1, TO: 0 } }];
  matchup.home.performanceComplete = false;
  matchup.away.performers = [];
  const rows = matchupPlayers(matchup, [traded]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].teamId, matchup.home.teamId);
  assert.equal(rows[0].stats.PTS, 12);
  assert.equal(rows[1].stats.PTS, undefined);
  assert.equal(rows.filter(r => r.teamId === matchup.away.teamId).length, 1);
  assert.deepEqual(sortMatchupPlayers(rows, "TO", false).map(r => r.stats.TO), [0, undefined]);
  assert.deepEqual(sortMatchupPlayers(rows, "PTS", true).map(r => r.stats.PTS), [12, undefined]);
});

test("weekly sorting handles percentages, ties and missing values in both directions", () => {
  const rows = [
    { playerId: 1, name: "B", teamId: 1, stats: { "FG%": .5 } },
    { playerId: 2, name: "C", teamId: 1, stats: { "FG%": null } },
    { playerId: 3, name: "A", teamId: 1, stats: { "FG%": .5 } },
    { playerId: 4, name: "D", teamId: 1, stats: { "FG%": .7 } },
  ];
  assert.deepEqual(sortMatchupPlayers(rows, "FG%", true).map(r => r.name), ["D", "A", "B", "C"]);
  assert.deepEqual(sortMatchupPlayers(rows, "FG%", false).map(r => r.name), ["A", "B", "D", "C"]);
});
