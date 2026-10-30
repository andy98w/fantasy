import type { Player, Snapshot, WeeklyPlayer } from "./schema";

export type MatchupPlayer = WeeklyPlayer & { teamId: number; player?: Player };

export function matchupPlayers(matchup: Snapshot["matchups"][number], players: Player[]): MatchupPlayer[] {
  const profiles = new Map(players.map(player => [player.id, player]));
  return [matchup.home, matchup.away].flatMap(side => {
    // Keep production credited to its original side even after a trade or drop.
    const rows: MatchupPlayer[] = side.performers.map(row => ({ ...row, teamId: side.teamId, player: profiles.get(row.playerId) }));
    const reported = new Set(rows.map(row => row.playerId));
    for (const player of players) {
      if (player.teamId === side.teamId && !reported.has(player.id)) {
        // No weekly split is unknown, never season averages or invented zeros.
        rows.push({ playerId: player.id, name: player.name, stats: {}, teamId: side.teamId, player });
      }
    }
    return rows;
  });
}

export function sortMatchupPlayers(rows: MatchupPlayer[], category: string, descending: boolean) {
  return [...rows].sort((a, b) => {
    const av = a.stats[category], bv = b.stats[category];
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    return (av != null && bv != null ? (av - bv) * (descending ? -1 : 1) : 0)
      || a.name.localeCompare(b.name) || a.teamId - b.teamId;
  });
}
