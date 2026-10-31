import { normalizeGameBoxscore, validGameId, type GameBoxscore } from "./game-boxscore";

/** Shared per process: coalesce viewers, bound storage, retain a dated result on outages. */
export function createGameBoxscoreLoader(request: typeof fetch = fetch, clock = Date.now) {
  const cache = new Map<string, { value?: GameBoxscore; expires: number; pending?: Promise<GameBoxscore> }>();
  return async function load(id: string): Promise<GameBoxscore> {
    if (!validGameId(id)) throw new Error("Invalid game ID");
    let entry = cache.get(id);
    if (entry?.pending) return entry.pending;
    if (entry && entry.expires > clock()) {
      if (entry.value) return entry.value;
      throw new Error("Box score unavailable");
    }
    if (!entry) {
      if (cache.size >= 80) {
        const oldest = [...cache].find(([, item]) => !item.pending)?.[0];
        if (!oldest) throw new Error("Box score service busy");
        cache.delete(oldest);
      }
      entry = { expires: 0 };
      cache.set(id, entry);
    }
    const current = entry;
    current.pending = (async () => {
      try {
        const response = await request(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`, {
          cache: "no-store", signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error("Box score upstream unavailable");
        const value = normalizeGameBoxscore(await response.json(), id, new Date(clock()).toISOString());
        current.value = value;
        current.expires = clock() + (value.game.state === "final" ? 300_000 : 20_000);
        return value;
      } catch {
        current.expires = clock() + 20_000;
        if (current.value && clock() - Date.parse(current.value.fetchedAt) < 86_400_000) {
          current.value = { ...current.value, stale: true };
          return current.value;
        }
        current.value = undefined;
        throw new Error("Box score unavailable");
      } finally {
        current.pending = undefined;
      }
    })();
    return current.pending;
  };
}
