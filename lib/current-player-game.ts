import { nbaAbbrev, nbaDate, type TodayData } from "./nba";
import type { Player } from "./schema";
import type { PlayerGame } from "./player-games";

/** Today's started game stays above the sortable historical log, without duplicating it. */
export function playerGameHistory(player: Pick<Player, "id" | "nbaTeam">, history: PlayerGame[], today?: TodayData) {
  const game = today?.games.find(g => nbaDate(new Date(g.startsAt)) === today.date &&
    ["live", "final", "suspended"].includes(g.state) &&
    [g.home.abbrev, g.away.abbrev].some(team => nbaAbbrev(team) === nbaAbbrev(player.nbaTeam)));
  if (!game) return { current: null, history };
  const logged = history.find(row => row.game.id === game.id);
  const line = today?.performances?.find(row => row.playerId === player.id && row.gameId === game.id);
  // No row in either source doesn't establish participation in a completed game.
  if (game.state === "final" && !line && !logged) return { current: null, history };
  const home = nbaAbbrev(player.nbaTeam) === nbaAbbrev(game.home.abbrev);
  const own = home ? game.home : game.away, opponent = home ? game.away : game.home;
  const stats: Record<string, string> = {};
  if (line) {
    const seconds = Math.round(line.minutes * 60);
    stats.minutes = seconds % 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : String(seconds / 60);
    for (const [key, cat] of Object.entries({ points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK", turnovers: "TO" })) {
      if (Number.isFinite(line.stats[cat])) stats[key] = String(line.stats[cat]);
    }
    for (const [key, made, attempted] of [
      ["fieldGoalsMade-fieldGoalsAttempted", "FGM", "FGA"],
      ["freeThrowsMade-freeThrowsAttempted", "FTM", "FTA"],
      ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3PM", "3PA"],
    ]) {
      if (Number.isFinite(line.stats[made]) && Number.isFinite(line.stats[attempted])) stats[key] = `${line.stats[made]}-${line.stats[attempted]}`;
    }
  }
  const result = game.state === "final" && own.score !== null && opponent.score !== null
    ? own.score > opponent.score ? "W" : own.score < opponent.score ? "L" : "T" : "—";
  // Completed game logs may contain later stat corrections than the daily box score.
  const row: PlayerGame = game.state === "final" && logged ? logged : {
    game, opponent: `${home ? "vs" : "@"} ${opponent.abbrev}`, result, stats,
  };
  return {
    current: { ...row, stale: today?.status !== "ready" || today?.boxscoreStatus === "error" },
    history: history.filter(row => row.game.id !== game.id),
  };
}
