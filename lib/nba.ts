import { isUnavailable } from "./availability";
import { z } from "zod";
import { CATEGORIES, type Category, type Player } from "./schema";

export const NBA_TIMEZONE = "America/Los_Angeles";
export type NbaTeam = { id: string; abbrev: string; name: string; logo: string | null; score: number | null };
export type NbaGame = {
  id: string;
  startsAt: string;
  state: "scheduled" | "live" | "final" | "delayed" | "postponed" | "cancelled" | "suspended" | "unknown";
  detail: string;
  remainingFraction?: number | null;
  home: NbaTeam;
  away: NbaTeam;
};
export type PerformanceDay = {
  performances?: import("./daily").DailyLine[];
  boxscoreStatus?: "ready" | "partial" | "error";
  date: string;
  fetchedAt: string | null;
  status: "ready" | "stale" | "error";
  games: NbaGame[];
};

export type TodayData = PerformanceDay & { performerDay?: PerformanceDay };

export function nbaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: NBA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
export function nbaTime(startsAt: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: NBA_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date(startsAt));
}
const aliases: Record<string, string> = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS", PHO: "PHX" };
export const nbaAbbrev = (value: string) => aliases[value.toUpperCase()] ?? value.toUpperCase();

const statusSchema = z.object({
  period: z.number().optional(), clock: z.number().optional(),
  type: z.object({ name: z.string(), state: z.string(), completed: z.boolean().optional(), shortDetail: z.string().optional() }),
});
const competitorSchema = z.object({
  homeAway: z.enum(["home", "away"]),
  score: z.union([z.string(), z.number()]).optional(),
  team: z.object({ id: z.string(), abbreviation: z.string(), displayName: z.string(), logo: z.string().optional() }),
});
const feedSchema = z.object({ events: z.array(z.object({
  id: z.string(), date: z.string(),
  competitions: z.array(z.object({ date: z.string().optional(), status: statusSchema, competitors: z.array(competitorSchema) })).min(1),
})) });

export function normalizeScoreboard(payload: unknown, date: string): NbaGame[] {
  const feed = feedSchema.parse(payload);
  return feed.events.flatMap((event): NbaGame[] => {
    const competition = event.competitions[0];
    const start = new Date(competition.date ?? event.date);
    if (!Number.isFinite(start.getTime())) throw new Error("Invalid game date");
    if (nbaDate(start) !== date) return [];
    const type = competition.status.type;
    const special: Record<string, NbaGame["state"]> = {
      STATUS_POSTPONED: "postponed", STATUS_CANCELED: "cancelled", STATUS_CANCELLED: "cancelled",
      STATUS_DELAYED: "delayed", STATUS_SUSPENDED: "suspended",
    };
    const state = special[type.name] ?? (type.completed || type.state === "post" ? "final" : type.state === "in" ? "live" : type.state === "pre" ? "scheduled" : "unknown");
    const side = (homeAway: "home" | "away"): NbaTeam => {
      const entry = competition.competitors.find((c) => c.homeAway === homeAway);
      if (!entry) throw new Error("Missing game team");
      const number = entry.score === undefined || entry.score === "" ? NaN : Number(entry.score);
      return {
        id: entry.team.id, abbrev: nbaAbbrev(entry.team.abbreviation), name: entry.team.displayName,
        logo: entry.team.logo && /^https:\/\/a\.espncdn\.com\//.test(entry.team.logo) ? entry.team.logo : null,
        score: ["live", "final", "suspended"].includes(state) && Number.isFinite(number) && number >= 0 ? number : null,
      };
    };
    const { period, clock } = competition.status;
    const remainingFraction = state === "final" ? 0 : state === "scheduled" ? 1 :
      state === "live" && period != null && period >= 1 && clock != null && clock >= 0 && clock <= (period > 4 ? 300 : 720)
        ? Math.min(1, (Math.max(0, 4 - period) * 720 + clock) / 2880) : null;
    return [{ remainingFraction, id: event.id, startsAt: start.toISOString(), state, detail: type.shortDetail ?? "", home: side("home"), away: side("away") }];
  });
}

export function gameLabel(game: NbaGame): string {
  if (game.state === "scheduled") return nbaTime(game.startsAt);
  if (game.state === "live") return game.detail || "Live";
  if (game.state === "final") return game.detail || "Final";
  return ({ delayed: "Delayed", postponed: "Postponed", cancelled: "Cancelled", suspended: "Suspended", unknown: "Status unavailable" })[game.state];
}

export function availableToday(players: Player[], games: NbaGame[], options: { notStarted: boolean; category: Category | "all"; now: number; includeInjured?: boolean }) {
  const playable = games.filter((game) => ["scheduled", "live", "final", "delayed"].includes(game.state) &&
    (!options.notStarted || (game.state === "scheduled" && Date.parse(game.startsAt) > options.now)));
  return players.flatMap((player) => {
    if (!options.includeInjured && isUnavailable(player)) return [];
    if (player.teamId !== null || !["FREEAGENT", "WAIVERS"].includes(player.availability)) return [];
    if (options.category !== "all" && (player.zTotal === null || !(player.contributions[options.category] > 0))) return [];
    const team = nbaAbbrev(player.nbaTeam);
    const game = playable.find((game) => game.home.abbrev === team || game.away.abbrev === team);
    if (!game) return [];
    return [{ player, game, opponent: game.home.abbrev === team ? `vs ${game.away.abbrev}` : `@ ${game.home.abbrev}` }];
  }).sort((a, b) => {
    if (options.category !== "all") {
      const difference = b.player.contributions[options.category] - a.player.contributions[options.category];
      if (difference) return difference;
    }
    if (a.player.zTotal === null) return b.player.zTotal === null ? a.player.name.localeCompare(b.player.name) : 1;
    if (b.player.zTotal === null) return -1;
    return b.player.zTotal - a.player.zTotal || a.player.id - b.player.id;
  });
}

export function playerStrengths(player: Player): Category[] {
  if (player.zTotal === null) return [];
  return CATEGORIES.filter((c) => player.contributions[c] > 0)
    .sort((a, b) => player.contributions[b] - player.contributions[a]).slice(0, 2);
}
