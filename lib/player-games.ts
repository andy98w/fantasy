import { z } from "zod";
import { nbaAbbrev, type NbaGame, type NbaTeam } from "./nba";
import { validGameId } from "./game-boxscore";

export type PlayerGame = { game: NbaGame; opponent: string; result: string; stats: Record<string, string> };
export type PlayerGames = { games: PlayerGame[]; fetchedAt: string; stale: boolean };
export const validPlayerGamesRequest = (id: string, season: string) => /^[1-9]\d{0,11}$/.test(id) && /^20\d{2}$/.test(season);
const teamSchema = z.object({ id: z.string(), abbreviation: z.string(), displayName: z.string().optional(), logo: z.string().optional() });
const eventSchema = z.object({
  id: z.string(), gameDate: z.string(), atVs: z.enum(["@", "vs"]),
  homeTeamId: z.string(), awayTeamId: z.string(), homeTeamScore: z.string().optional(), awayTeamScore: z.string().optional(),
  gameResult: z.string(), team: teamSchema, opponent: teamSchema,
});
const schema = z.object({
  names: z.array(z.string()), events: z.record(z.string(), eventSchema),
  filters: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  seasonTypes: z.array(z.object({ displayName: z.string(), categories: z.array(z.object({
    type: z.string(), events: z.array(z.object({ eventId: z.string(), stats: z.array(z.string()) })).optional(),
  })) })),
});
export function normalizePlayerGames(payload: unknown, season: string, fetchedAt: string): PlayerGames {
  const data = schema.parse(payload);
  const returnedSeason = data.filters?.find((filter) => filter.name === "season")?.value;
  if (returnedSeason && returnedSeason !== season) throw new Error("Wrong game log season");
  const seen = new Set<string>();
  const games = data.seasonTypes.filter((type) => !/preseason|all.star/i.test(type.displayName)).flatMap((type) =>
    type.categories.filter((category) => category.type === "event").flatMap((category) => (category.events ?? []).flatMap((row): PlayerGame[] => {
      const event = data.events[row.eventId];
      if (!event || event.id !== row.eventId || !validGameId(event.id)) throw new Error("Missing game log event");
      if (seen.has(event.id)) return [];
      seen.add(event.id);
      // Game logs contain played games. Skip entries without a completed result.
      if (!["W", "L", "T"].includes(event.gameResult)) return [];
      const startsAt = new Date(event.gameDate);
      if (!Number.isFinite(startsAt.getTime())) throw new Error("Invalid game log date");
      const side = (id: string, score?: string): NbaTeam => {
        const team = [event.team, event.opponent].find((team) => team.id === id);
        if (!team) throw new Error("Game log team mismatch");
        const number = score?.trim() ? Number(score) : NaN;
        return { id, abbrev: nbaAbbrev(team.abbreviation), name: team.displayName ?? nbaAbbrev(team.abbreviation),
          logo: team.logo && /^https:\/\/a\.espncdn\.com\//.test(team.logo) ? team.logo : null,
          score: Number.isFinite(number) && number >= 0 ? number : null };
      };
      if (event.homeTeamId === event.awayTeamId || event.team.id === event.opponent.id) throw new Error("Duplicate game log teams");
      const stats = Object.fromEntries(data.names.map((key, i) => [key === "totalRebounds" ? "rebounds" : key, row.stats[i]?.trim() || "—"]));
      return [{ game: { id: event.id, startsAt: startsAt.toISOString(), state: "final", detail: "Final",
        home: side(event.homeTeamId, event.homeTeamScore), away: side(event.awayTeamId, event.awayTeamScore) },
        opponent: `${event.atVs} ${nbaAbbrev(event.opponent.abbreviation)}`, result: event.gameResult, stats }];
    })),
  ).sort((a, b) => Date.parse(b.game.startsAt) - Date.parse(a.game.startsAt));
  return { games, fetchedAt, stale: false };
}

export function createPlayerGamesLoader(request: typeof fetch = fetch, clock = Date.now) {
  const cache = new Map<string, { value?: PlayerGames; expires: number; pending?: Promise<PlayerGames> }>();
  return async (id: string, season: string): Promise<PlayerGames> => {
    if (!validPlayerGamesRequest(id, season)) throw new Error("Invalid player or season");
    const key = `${id}:${season}`;
    let entry = cache.get(key);
    if (entry?.pending) return entry.pending;
    if (entry && entry.expires > clock()) {
      if (entry.value) return entry.value;
      throw new Error("Game log unavailable");
    }
    if (!entry) {
      if (cache.size >= 120) {
        const oldest = [...cache].find(([, item]) => !item.pending)?.[0];
        if (!oldest) throw new Error("Game log busy");
        cache.delete(oldest);
      }
      entry = { expires: 0 }; cache.set(key, entry);
    }
    const current = entry;
    current.pending = (async () => {
      try {
        const response = await request(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=${season}`, {
          cache: "no-store", signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error("Game log unavailable");
        current.value = normalizePlayerGames(await response.json(), season, new Date(clock()).toISOString());
        current.expires = clock() + 300_000;
        return current.value;
      } catch {
        current.expires = clock() + 20_000;
        if (current.value && clock() - Date.parse(current.value.fetchedAt) < 86_400_000) {
          current.value = { ...current.value, stale: true }; return current.value;
        }
        current.value = undefined; throw new Error("Game log unavailable");
      } finally { current.pending = undefined; }
    })();
    return current.pending;
  };
}
