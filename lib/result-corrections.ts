import type { Matchup, Snapshot } from "./schema";

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
export function applyResultCorrections(snapshot: Snapshot): Snapshot {
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
