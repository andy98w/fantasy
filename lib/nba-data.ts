import "server-only";
import { nbaDate, nextDate, normalizeScoreboard, type TodayData } from "./nba";

type Cache = { date: string; checkedAt: number; value?: TodayData; pending?: Promise<TodayData> };
const globalCache = globalThis as unknown as { nbaScoreboard?: Cache };

export async function loadToday(): Promise<TodayData> {
  const now = Date.now();
  const date = nbaDate(new Date(now));
  const cache = globalCache.nbaScoreboard?.date === date
    ? globalCache.nbaScoreboard
    : (globalCache.nbaScoreboard = { date, checkedAt: 0 });
  if (cache.pending) return cache.pending;
  if (cache.value && now - cache.checkedAt < 60_000) return cache.value;
  cache.pending = (async () => {
    try {
      // ESPN dates use Eastern time; include the next date, then filter to the
      // shared Pacific calendar day so late games and midnight are consistent.
      const batches = await Promise.all([date, nextDate(date)].map(async (day) => {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${day.replaceAll("-", "")}&limit=50`, {
          cache: "no-store", signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) throw new Error("Scoreboard unavailable");
        return normalizeScoreboard(await response.json(), date);
      }));
      const games = [...new Map(batches.flat().map((game) => [game.id, game])).values()]
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      cache.value = { date, fetchedAt: new Date().toISOString(), status: "ready", games };
    } catch {
      const previous = cache.value;
      cache.value = previous?.fetchedAt && now - Date.parse(previous.fetchedAt) < 15 * 60_000
        ? { ...previous, status: "stale" }
        : { date, fetchedAt: null, status: "error", games: [] };
    } finally {
      cache.checkedAt = Date.now();
      cache.pending = undefined;
    }
    return cache.value!;
  })();
  return cache.pending;
}
