import type { Matchup, Snapshot } from "./schema";
import { compareCategories } from "./season";

// Owner-confirmed Week 1 results, 2026-10-29. IDs/home-away pairings verified
// against ESPN's schedule. Only outcomes were supplied, not category scores.
const weekOne = [
  { id: 1, home: 6, away: 8 }, // Lawrence (Broke Young Boys) over Peter (p)
  { id: 2, home: 5, away: 7 }, // Yifei (sheeeeshhhh) over Evan (White Boy Wednesday)
  { id: 3, home: 2, away: 3 }, // Andy (Kirk's Mercs) over Raymond (Brunson's deadly daddies)
  { id: 4, home: 10, away: 9 }, // Derek (Tennesee Town Sahurs) over Yufei (Yuf)
  { id: 5, home: 11, away: 1 }, // Arthur (ZZZZZ) over Nathan (thehungdynasty)
  { id: 6, home: 12, away: 4 }, // Shunchao (CreepyZebra) over Lucas (Lucas's Loud Team)
];

/** Overlay durable corrections on reads; never modify ESPN or stored raw imports. */
function applyWeekOneResults(snapshot: Snapshot): Snapshot {
  if (snapshot.mode !== "live" || snapshot.league.id !== 1834203755 ||
      snapshot.league.season !== 2027 || snapshot.league.matchupPeriod <= 1 ||
      snapshot.league.scoringType !== "H2H_MOST_CATEGORIES") return snapshot;
  const teamIds = new Set(snapshot.teams.map(t => t.id));
  if (weekOne.some(m => !teamIds.has(m.home) || !teamIds.has(m.away))) return snapshot;

  const history = new Map(snapshot.matchupHistory.map(m => [m.id, m]));
  const corrections = new Map<number, Matchup>();
  const existing = new Map([...snapshot.matchupHistory, ...snapshot.matchups].map(m => [m.id, m]));
  const changes = new Map<number, { wins: number; losses: number; ties: number }>();
  const adjust = (match: Matchup, amount: number) => {
    if (match.result === "UNDECIDED") return;
    for (const side of ["home", "away"] as const) {
      const id = match[side].teamId;
      const change = changes.get(id) ?? { wins: 0, losses: 0, ties: 0 };
      const field = match.result === "TIE" ? "ties" : match.result === side.toUpperCase() ? "wins" : "losses";
      change[field] += amount;
      changes.set(id, change);
    }
  };
  for (const correction of weekOne) {
    const old = existing.get(correction.id);
    // Refuse to apply an ID to a different schedule if upstream changes it.
    if (old && (old.period !== 1 || old.home.teamId !== correction.home || old.away.teamId !== correction.away)) continue;
    if (old) adjust(old, -1);
    const side = (teamId: number): Matchup["home"] => ({
      teamId, wins: null, ties: null, stats: {}, performers: [], performanceComplete: false,
    });
    // A later ESPN recovery can restore real stats without adding another win.
    const corrected: Matchup = old?.result === "AWAY" ? old : {
      id: correction.id, period: 1, result: "AWAY",
      home: side(correction.home), away: side(correction.away),
    };
    history.set(corrected.id, corrected);
    corrections.set(corrected.id, corrected);
    adjust(corrected, 1);
  }
  return {
    ...snapshot,
    teams: snapshot.teams.map(team => {
      const delta = changes.get(team.id);
      return delta ? { ...team, wins: team.wins + delta.wins, losses: team.losses + delta.losses, ties: team.ties + delta.ties } : team;
    }),
    matchups: snapshot.matchups.map(m => corrections.get(m.id) ?? m),
    matchupHistory: [...history.values()].sort((a, b) => a.period - b.period || a.id - b.id),
  };
}


// User-confirmed missing Monday totals after the league reset, supplied Nov 1.
// This is an additive correction to ESPN's reset totals, not a player stat line.
// Keep it scoped to the verified Week 2 matchup (8 home vs 7 away). If ESPN ever
// restores this day upstream, retire this correction after verifying that recovery;
// cumulative totals alone cannot establish whether Monday has been restored.
const missingMonday = {
  id: "1834203755-2027-week2-team8-2026-10-26",
  date: "2026-10-26",
  label: "Restored Monday totals after league reset",
  stats: { FGM: 10, FGA: 25, FTM: 4, FTA: 4, "3PM": 1, REB: 15, AST: 3, STL: 3, BLK: 1, TO: 7, PTS: 25 },
};
const isWeekTwoMatch = (m: Matchup) => m.id === 7 && m.period === 2 && m.home.teamId === 8 && m.away.teamId === 7;

function restoreMonday(match: Matchup): Matchup {
  if (!isWeekTwoMatch(match) || match.home.statCorrections?.some(c => c.id === missingMonday.id)) return match;
  const stats = { ...match.home.stats };
  for (const [category, delta] of Object.entries(missingMonday.stats)) {
    const value = stats[category];
    // A known missing day is not a substitute for an unknown remainder of the week.
    stats[category] = value == null || !Number.isFinite(value) ? null : value + delta;
  }
  for (const [makes, attempts, rate] of [["FGM", "FGA", "FG%"], ["FTM", "FTA", "FT%"]]) {
    stats[rate] = stats[makes] != null && stats[attempts] != null && stats[attempts]! > 0
      ? stats[makes]! / stats[attempts]! : null;
  }
  const score = compareCategories(stats, match.away.stats);
  const complete = score.missing === 0;
  const home = { ...match.home, stats, wins: complete ? score.home : null, ties: complete ? score.ties : null,
    // No player allocation was supplied; preserve imported lines, flag incomplete coverage.
    performanceComplete: false,
    statCorrections: [...(match.home.statCorrections ?? []), { ...missingMonday, stats: { ...missingMonday.stats } }] };
  return { ...match, home,
    away: { ...match.away, wins: complete ? score.away : null, ties: complete ? score.ties : null },
    result: match.result === "UNDECIDED" || !complete ? match.result : score.home === score.away ? "TIE" : score.home > score.away ? "HOME" : "AWAY" };
}

function applyWeekTwoStats(snapshot: Snapshot): Snapshot {
  if (snapshot.mode !== "live" || snapshot.league.id !== 1834203755 || snapshot.league.season !== 2027 ||
      snapshot.league.matchupPeriod < 2 || snapshot.league.scoringType !== "H2H_MOST_CATEGORIES") return snapshot;
  const existing = new Map([...snapshot.matchupHistory, ...snapshot.matchups].map(m => [m.id, m]));
  const old = existing.get(7);
  if (!old || !isWeekTwoMatch(old)) return snapshot;
  const corrected = restoreMonday(old);
  // Only a completed result can change standings. Account for the delta from
  // ESPN's imported result, so each fresh import and repeated read stays stable.
  const record = (match: Matchup, teamId: number) => {
    const won = match.result === (match.home.teamId === teamId ? "HOME" : "AWAY");
    return { wins: Number(won), losses: Number(match.result !== "UNDECIDED" && match.result !== "TIE" && !won), ties: Number(match.result === "TIE") };
  };
  return { ...snapshot,
    matchups: snapshot.matchups.map(restoreMonday),
    matchupHistory: snapshot.matchupHistory.map(restoreMonday),
    teams: old.result === corrected.result ? snapshot.teams : snapshot.teams.map(team => {
      if (team.id !== 8 && team.id !== 7) return team;
      const before = record(old, team.id), after = record(corrected, team.id);
      return { ...team, wins: team.wins + after.wins - before.wins,
        losses: team.losses + after.losses - before.losses, ties: team.ties + after.ties - before.ties };
    }),
  };
}

/** Durable, idempotent overlays shared by dashboard, forecasts, records and MCP. */
export function applyResultCorrections(snapshot: Snapshot): Snapshot {
  return applyWeekTwoStats(applyWeekOneResults(snapshot));
}
