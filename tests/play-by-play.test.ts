import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlayByPlay, selectPlays, playPeriodLabel } from "../lib/play-by-play";

const play = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id, text, sequenceNumber: id, period: { number: 1 }, clock: { displayValue: "12:00" },
  awayScore: 0, homeScore: 0, scoringPlay: false, ...extra,
});

test("play-by-play preserves non-shot events, neutral events, zero scores and missing scores", () => {
  const report = normalizePlayByPlay({ plays: [
    play("1", "Jump ball"),
    play("2", "Player enters the game", { team: { id: "home" } }),
    play("3", "Player makes free throw", { scoringPlay: true, homeScore: 1 }),
    play("4", "Turnover"), play("5", "Foul", { awayScore: undefined, homeScore: -1 }),
    play("6", "End of quarter", { clock: { displayValue: "0.0" } }),
  ] }, ["home", "away"]);
  assert.equal(report.available, true);
  assert.equal(report.plays.length, 6);
  assert.equal(report.plays[0].teamId, null);
  assert.equal(report.plays[0].awayScore, 0);
  assert.equal(report.plays[2].homeScore, 1);
  assert.equal(report.plays[2].scoring, true);
  assert.equal(report.plays[4].awayScore, null);
  assert.equal(report.plays[4].homeScore, null);
});

test("play chronology uses quarter, fractional clock and sequence, deduplicates corrections and includes overtime", () => {
  const report = normalizePlayByPlay({ plays: [
    play("11", "End game", { period: { number: 5 }, clock: { displayValue: "0.0" } }),
    play("10", "Overtime tip", { period: { number: 5 }, clock: { displayValue: "5:00" } }),
    play("2", "Old wording", { clock: { displayValue: "11:59.2" } }),
    play("1", "First"),
    play("3", "Substitution", { clock: { displayValue: "11:59.2" } }),
    play("2", "Corrected wording", { clock: { displayValue: "11:59.2" } }),
  ] }, ["home", "away"]);
  assert.deepEqual(report.plays.map(p => p.id), ["1", "2", "3", "10", "11"]);
  assert.equal(report.plays[1].text, "Corrected wording");
  assert.deepEqual(selectPlays(report, "all", true).map(p => p.id), ["11", "10", "3", "2", "1"]);
  assert.deepEqual(selectPlays(report, "5", false).map(p => p.id), ["10", "11"]);
  assert.deepEqual(selectPlays(report, "2", true), []);
  assert.equal(report.plays[0].id, "1"); // Filtering/reversal cannot mutate the shared response.
  assert.equal(playPeriodLabel(6), "OT2");
});

test("bad plays cannot break the box score or fabricate a time, team or score", () => {
  const report = normalizePlayByPlay({ plays: [null, {},
    play("1", "Wrong team", { team: { id: "other" } }),
    play("2", "Bad clock", { clock: { displayValue: "13:00" } }),
    play("3", "Bad OT clock", { period: { number: 5 }, clock: { displayValue: "6:00" } }),
    play("4", "Valid", { homeScore: "unknown", awayScore: null }),
  ] }, ["home", "away"]);
  assert.equal(report.skipped, 5);
  assert.equal(report.plays.length, 1);
  assert.equal(report.plays[0].homeScore, null);
  assert.equal(normalizePlayByPlay({}, []).available, false);
  assert.equal(normalizePlayByPlay(null, []).available, false);
  assert.deepEqual(normalizePlayByPlay({ plays: [] }, []), { available: true, plays: [], skipped: 0 });
});
