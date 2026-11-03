import type { Player, Snapshot, WeeklyPlayer } from "./schema";
import { gameLabel, nbaAbbrev, nbaDate, type NbaGame, type TodayData } from "./nba";

export type MatchupPlayer = WeeklyPlayer & { teamId: number; player?: Player; game?: NbaGame };

export function matchupLineupSlot(slot: string | null | undefined): "active" | "bench" | "ir" | "unknown" {
  if (slot === "BE" || slot === "12") return "bench";
  if (slot === "IR" || slot === "13") return "ir";
  return slot && ["PG", "SG", "SF", "PF", "C", "G", "F", "SG/SF", "G/F", "PF/C", "F/C", "UTIL", "Rookie"].includes(slot) ? "active" : "unknown";
}

/** Group after sorting so each section retains the selected stat order. */
export function matchupPlayerGroups(rows: MatchupPlayer[], daily: boolean) {
  if (!daily) return [{ key: "week", label: null, rows }];
  return [
    { key: "active", label: "Active lineup", rows: rows.filter(row => matchupLineupSlot(row.player?.slot) === "active") },
    { key: "inactive", label: "Bench / IR · Not in scoring lineup", rows: rows.filter(row => ["bench", "ir"].includes(matchupLineupSlot(row.player?.slot))) },
    { key: "unknown", label: "Lineup slot unavailable", rows: rows.filter(row => matchupLineupSlot(row.player?.slot) === "unknown") },
  ].filter(group => group.rows.length);
}

/** Today's NBA production for the current rosters, not fantasy lineup credit. */
export function todayMatchupPlayers(matchup: Snapshot["matchups"][number], players: Player[], today: TodayData | undefined, date: string): MatchupPlayer[] {
  if (!today || today.date !== date || today.status === "error") return [];
  const games = today.games.filter(game => nbaDate(new Date(game.startsAt)) === date);
  return players.flatMap(player => {
    if (player.teamId !== matchup.home.teamId && player.teamId !== matchup.away.teamId) return [];
    const lines = (today.performances ?? []).filter(line => line.playerId === player.id && games.some(game => game.id === line.gameId));
    const scheduled = games.filter(game => [game.home.abbrev, game.away.abbrev].includes(nbaAbbrev(player.nbaTeam)));
    const playerGames = lines.length ? games.filter(game => lines.some(line => line.gameId === game.id)) : scheduled;
    return playerGames.map(game => {
      const line = ["live", "final", "suspended"].includes(game.state) ? lines.find(line => line.gameId === game.id) : undefined;
      return { playerId: player.id, name: player.name, player, teamId: player.teamId!, game,
        stats: line ? { ...line.stats, GP: 1, MIN: line.minutes,
          "FG%": line.stats.FGA > 0 ? line.stats.FGM / line.stats.FGA : null,
          "FT%": line.stats.FTA > 0 ? line.stats.FTM / line.stats.FTA : null } : {} };
    });
  });
}

export function matchupGameLabel(game: NbaGame, stale: boolean): string {
  if (game.state === "live") return stale ? "Last seen live" : "In progress";
  return `${gameLabel(game)}${game.state === "scheduled" ? " PT" : ""}`;
}

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
