import { normalizeBoxscore } from "./daily";
import { nbaDate, nextDate, normalizeScoreboard, type NbaGame, type PerformanceDay, type TodayData } from "./nba";

const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const gamesStarted = (games: NbaGame[]) => games.some(g => ["live", "final", "suspended"].includes(g.state));

// One shared request/cache for all visitors. The previous slate is fetched from
// ESPN too, so a restart or midnight deploy does not erase the morning recap.
export function createNbaLoader(request: typeof fetch = fetch, clock = Date.now) {
  let current: PerformanceDay | undefined;
  let previous: PerformanceDay | undefined;
  let historyCheckedAt = 0;
  let historyFor = "";
  let checkedAt = 0;
  let startedDate = "";
  let value: TodayData | undefined;
  let pending: Promise<TodayData> | undefined;

  async function json(url: string) {
    const response = await request(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("NBA data unavailable");
    return response.json();
  }
  const scoreboard = (dates: string) => json(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dates.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1$2$3")}&limit=1000`);
  async function withBoxscores(date: string, games: NbaGame[]): Promise<PerformanceDay> {
    const results = await Promise.allSettled(games.filter(g => ["live", "final"].includes(g.state)).map(async game =>
      normalizeBoxscore(await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(game.id)}`), game)));
    const failed = results.filter(r => r.status === "rejected").length;
    return { date, games, fetchedAt: new Date(clock()).toISOString(), status: "ready",
      performances: results.flatMap(r => r.status === "fulfilled" ? r.value : []),
      boxscoreStatus: failed ? failed === results.length ? "error" : "partial" : "ready" };
  }
  async function loadPrevious(date: string): Promise<PerformanceDay | undefined> {
    const ttl = previous?.games.some(g => g.state === "live" || g.state === "suspended") ? 20_000 : 300_000;
    if (historyFor === date && clock() - historyCheckedAt < ttl) return previous;
    try {
      // ESPN's NBA scoreboard accepts single dates, not date ranges. Walk
      // backward across rest days; include the adjacent Eastern feed for late tips.
      let nextFeed = await scoreboard(date);
      let recent: PerformanceDay | undefined;
      for (let days = 1; days <= 14; days++) {
        const day = shiftDate(date, -days);
        const feed = await scoreboard(day);
        const games = [...new Map([normalizeScoreboard(feed, day), normalizeScoreboard(nextFeed, day)].flat().map(g => [g.id, g])).values()];
        nextFeed = feed;
        if (!gamesStarted(games)) continue;
        recent = await withBoxscores(day, games);
        break;
      }
      if (recent?.boxscoreStatus === "error" && previous?.date === recent.date && previous.performances?.length) {
        previous = { ...previous, status: "stale" };
      } else previous = recent;
    } catch {
      if (previous) previous = { ...previous, status: "stale" };
    }
    historyFor = date;
    historyCheckedAt = clock();
    return previous;
  }
  return async function loadToday(): Promise<TodayData> {
    if (pending) return pending;
    const now = clock(), date = nbaDate(new Date(now));
    if (value?.date === date && now - checkedAt < 20_000) return value;
    pending = (async () => {
      if (current && current.date !== date) {
        if (gamesStarted(current.games)) previous = current;
        current = undefined;
      }
      try {
        // ESPN dates are Eastern; filter the two feeds back to the Pacific day.
        const batches = await Promise.all([date, nextDate(date)].map(async day => normalizeScoreboard(await scoreboard(day), date)));
        const games = [...new Map(batches.flat().map(g => [g.id, g])).values()].sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
        current = await withBoxscores(date, games);
      } catch {
        current = current?.fetchedAt && now - Date.parse(current.fetchedAt) < 15 * 60_000
          ? { ...current, status: "stale" } : { date, fetchedAt: null, status: "error", games: [] };
      }
      // Switch on actual game state, not the advertised tip time (delays happen).
      if (gamesStarted(current.games)) startedDate = date;
      const performerDay = startedDate === date ? current : await loadPrevious(date);
      value = { ...current, performerDay: performerDay ?? current };
      checkedAt = clock();
      return value;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
