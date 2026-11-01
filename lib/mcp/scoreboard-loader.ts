import { nextDate, normalizeScoreboard, type PerformanceDay } from "../nba";
import { dateInput } from "./queries";

// Bounded, coalesced cache. Both Eastern-date feeds are filtered to one Pacific day.
export function createScoreboardLoader(request: typeof fetch = fetch, clock = Date.now) {
  const cache = new Map<string, { value?: PerformanceDay; expires: number; pending?: Promise<PerformanceDay> }>();
  return async (date: string): Promise<PerformanceDay> => {
    dateInput.parse(date);
    let entry = cache.get(date);
    if (entry?.pending) return entry.pending;
    if (entry?.value && entry.expires > clock()) return entry.value;
    if (!entry) {
      if (cache.size >= 40) {
        const key = [...cache].find(([, row]) => !row.pending)?.[0];
        if (!key) throw new Error("Scoreboard busy");
        cache.delete(key);
      }
      entry = { expires: 0 }; cache.set(date, entry);
    }
    const current = entry;
    current.pending = (async () => {
      try {
        const batches = await Promise.all([date, nextDate(date)].map(async day => {
          const response = await request(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${day.replaceAll("-", "")}&limit=1000`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
          if (!response.ok) throw new Error("Scoreboard unavailable");
          return normalizeScoreboard(await response.json(), date);
        }));
        current.value = { date, fetchedAt: new Date(clock()).toISOString(), status: "ready", games: [...new Map(batches.flat().map(g => [g.id, g])).values()].sort((a,b) => a.startsAt.localeCompare(b.startsAt)) };
      } catch {
        current.value = current.value?.fetchedAt && clock() - Date.parse(current.value.fetchedAt) < 900000
          ? { ...current.value, status: "stale" } : { date, fetchedAt: null, status: "error", games: [] };
      }
      current.expires = clock() + 20000;
      return current.value;
    })();
    try { return await current.pending; } finally { current.pending = undefined; }
  };
}
