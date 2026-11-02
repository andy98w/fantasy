import type { Matchup, Snapshot } from "./schema";
import { compareCategories } from "./season";

export type ArchiveMatchup = {
  key: string; period: number; homeId: number; awayId: number;
  match: Matchup | null;
  state: "Final" | "In progress" | "Scheduled" | "Result pending" | "Unavailable";
};

/** Current scores supersede retained copies; only imported pairs fill schedule gaps. */
export function matchupArchive(data: Snapshot) {
  const imported = new Map([...data.matchupHistory, ...data.matchups].map(match => [match.id, match]));
  const entries: ArchiveMatchup[] = [...imported.values()].map(match => ({
    key: `match-${match.id}`, period: match.period, homeId: match.home.teamId, awayId: match.away.teamId, match,
    state: match.result !== "UNDECIDED" ? "Final" : match.period > data.league.matchupPeriod ? "Scheduled"
      : match.period === data.league.matchupPeriod ? "In progress" : "Result pending",
  }));
  for (const pair of data.forecastSchedule?.pairs ?? []) {
    if (entries.some(row => row.period === pair.period &&
      ((row.homeId === pair.home && row.awayId === pair.away) || (row.homeId === pair.away && row.awayId === pair.home)))) continue;
    entries.push({ key: `pair-${pair.period}-${pair.home}-${pair.away}`, period: pair.period,
      homeId: pair.home, awayId: pair.away, match: null,
      state: pair.period > data.league.matchupPeriod ? "Scheduled" : "Unavailable" });
  }
  const periods = [...new Set([
    ...Array.from({ length: Math.min(60, Math.max(0, data.league.matchupPeriod)) }, (_, index) => index + 1),
    ...entries.map(row => row.period), data.league.matchupPeriod,
  ])].sort((a, b) => a - b);
  return { periods, entries: entries.sort((a, b) => a.period - b.period || a.homeId - b.homeId || a.awayId - b.awayId) };
}

export function archiveScore(entry: ArchiveMatchup) {
  const match = entry.match;
  if (!match || entry.state === "Scheduled") return { home: "—", away: "—", ties: null, categoryTotals: false };
  const categories = compareCategories(match.home.stats, match.away.stats);
  // A confirmed winner without stats (the reset Week 1) must not become 0–0.
  if (categories.missing === 0) return { home: String(categories.home), away: String(categories.away), ties: categories.ties, categoryTotals: true };
  if (match.result !== "UNDECIDED") return {
    home: match.result === "TIE" ? "T" : match.result === "HOME" ? "W" : "L",
    away: match.result === "TIE" ? "T" : match.result === "AWAY" ? "W" : "L", ties: null, categoryTotals: false,
  };
  return { home: "—", away: "—", ties: null, categoryTotals: false };
}
