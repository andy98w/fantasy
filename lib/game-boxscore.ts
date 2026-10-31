import { z } from "zod";
import { nbaDate, normalizeScoreboard, type NbaGame } from "./nba";

export const BOX_COLUMNS = [
  ["minutes", "MIN"], ["points", "PTS"],
  ["fieldGoalsMade-fieldGoalsAttempted", "FG"],
  ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3PT"],
  ["freeThrowsMade-freeThrowsAttempted", "FT"],
  ["rebounds", "REB"], ["assists", "AST"], ["steals", "STL"],
  ["blocks", "BLK"], ["turnovers", "TO"], ["plusMinus", "+/−"],
] as const;
export type BoxPlayer = { id: number; name: string; starter: boolean; didNotPlay: boolean; reason: string; stats: Record<string, string> };
export type BoxTeam = { id: string; players: BoxPlayer[]; totals: Record<string, string> };
export type GameBoxscore = { game: NbaGame; teams: BoxTeam[]; fetchedAt: string; stale: boolean };
export const validGameId = (id: string) => /^\d{6,12}$/.test(id);

const summarySchema = z.object({
  header: z.object({
    id: z.string(),
    competitions: z.array(z.object({
      date: z.string(),
      competitors: z.array(z.object({
        team: z.object({ logos: z.array(z.object({ href: z.string() })).optional() }).passthrough(),
      }).passthrough()),
    }).passthrough()).min(1),
  }),
  boxscore: z.object({ players: z.array(z.object({
    team: z.object({ id: z.string() }),
    statistics: z.array(z.object({
      keys: z.array(z.string()), totals: z.array(z.string()).optional(),
      athletes: z.array(z.object({
        athlete: z.object({ id: z.string().regex(/^\d+$/), displayName: z.string().min(1) }),
        starter: z.boolean().optional(), didNotPlay: z.boolean().optional(),
        reason: z.string().optional(), stats: z.array(z.string()),
      })),
    })),
  })).optional() }).optional(),
});

export function normalizeGameBoxscore(payload: unknown, id: string, fetchedAt: string): GameBoxscore {
  const data = summarySchema.parse(payload);
  if (data.header.id !== id) throw new Error("Game identity mismatch");
  const competition = data.header.competitions[0];
  const start = new Date(competition.date);
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid game date");
  const [game] = normalizeScoreboard({ events: [{ id, date: competition.date, competitions: [{
    ...competition,
    competitors: competition.competitors.map((entry) => ({ ...entry, team: {
      ...entry.team, logo: entry.team.logo ?? entry.team.logos?.[0]?.href,
    } })),
  }] }] }, nbaDate(start));
  if (game.home.id === game.away.id) throw new Error("Duplicate game teams");
  const teamIds = new Set<string>();
  const playerIds = new Set<number>();
  const teams = (data.boxscore?.players ?? []).map((team): BoxTeam => {
    if (![game.home.id, game.away.id].includes(team.team.id) || teamIds.has(team.team.id)) throw new Error("Invalid box score team");
    teamIds.add(team.team.id);
    const totals: Record<string, string> = {};
    const players = team.statistics.flatMap((group) => {
      const values = (stats: string[]) => Object.fromEntries(group.keys.map((key, index) => [key, stats[index]?.trim() || "—"]));
      if (group.totals?.length) Object.assign(totals, values(group.totals));
      return group.athletes.map((row): BoxPlayer => {
        const playerId = Number(row.athlete.id);
        if (!Number.isSafeInteger(playerId) || playerIds.has(playerId)) throw new Error("Duplicate or invalid box score player");
        playerIds.add(playerId);
        return { id: playerId, name: row.athlete.displayName, starter: row.starter ?? false,
          didNotPlay: row.didNotPlay ?? false, reason: row.didNotPlay ? row.reason ?? "" : "",
          stats: values(row.stats) };
      });
    });
    return { id: team.team.id, players, totals };
  });
  return { game, teams, fetchedAt, stale: false };
}
