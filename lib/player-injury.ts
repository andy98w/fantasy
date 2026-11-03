import { z } from "zod";

export type InjuryReport = {
  playerId: number; status: string; injury: string | null; estimatedReturn: string | null;
  reportedAt: string | null; summary: string; report: string; reevaluation: boolean;
  source: string; url: string;
};
export type PlayerInjury = { report: InjuryReport | null; fetchedAt: string; stale: boolean };
const reportSchema = z.object({
  status: z.string(), date: z.string().optional(), shortComment: z.string().default(""), longComment: z.string().default(""),
  athlete: z.object({ links: z.array(z.object({ href: z.string() })), notes: z.object({ items: z.array(z.object({ source: z.string().optional() })) }).optional() }),
  details: z.object({ type: z.string().optional(), returnDate: z.string().optional() }).optional(),
});
const feedSchema = z.object({ status: z.literal("success"), season: z.object({ year: z.number().int() }),
  injuries: z.array(z.object({ injuries: z.array(reportSchema) })) });
const calendarDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value ? value : null;
export function normalizeInjuries(payload: unknown) {
  const data = feedSchema.parse(payload), reports = new Map<number, InjuryReport>();
  for (const row of data.injuries.flatMap(team => team.injuries)) {
    // The injury's ID is not the athlete's ID. Match the canonical player link.
    const url = row.athlete.links.map(link => link.href).find(link => /^https:\/\/www\.espn\.com\/nba\/player\/_\/id\/[1-9]\d*(?:\/|$)/.test(link));
    if (!url) continue;
    const playerId = Number(url.match(/\/id\/(\d+)/)![1]);
    const reportedAt = row.date && Number.isFinite(Date.parse(row.date)) ? new Date(row.date).toISOString() : null;
    const previous = reports.get(playerId);
    if (previous && (previous.reportedAt ? Date.parse(previous.reportedAt) : -Infinity) >= (reportedAt ? Date.parse(reportedAt) : -Infinity)) continue;
    reports.set(playerId, { playerId, status: row.status, injury: row.details?.type || null,
      estimatedReturn: calendarDate(row.details?.returnDate), reportedAt, summary: row.shortComment, report: row.longComment,
      reevaluation: /re[ -]?evaluat/i.test(`${row.shortComment} ${row.longComment}`),
      source: row.athlete.notes?.items[0]?.source || "ESPN", url });
  }
  return { season: data.season.year, reports };
}

// One bounded cache for the whole NBA feed, shared across player profiles.
export function createInjuryLoader(request: typeof fetch = fetch, clock = Date.now) {
  let value: (ReturnType<typeof normalizeInjuries> & { fetchedAt: string }) | undefined;
  let expires = 0, pending: Promise<void> | undefined;
  return async (id: string, season: string): Promise<PlayerInjury> => {
    if (!/^[1-9]\d{0,11}$/.test(id) || !/^20\d{2}$/.test(season)) throw new Error("Invalid player or season");
    if (clock() >= expires && !pending) {
      pending = (async () => {
        try {
          const response = await request("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries", {
            cache: "no-store", signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) throw new Error("Unavailable");
          value = { ...normalizeInjuries(await response.json()), fetchedAt: new Date(clock()).toISOString() };
          expires = clock() + 300_000;
        } catch { expires = clock() + 20_000; }
        finally { pending = undefined; }
      })();
    }
    if (pending) await pending;
    if (!value || value.season !== Number(season) || clock() - Date.parse(value.fetchedAt) >= 86_400_000) throw new Error("Injury report unavailable");
    return { report: value.reports.get(Number(id)) ?? null, fetchedAt: value.fetchedAt, stale: clock() - Date.parse(value.fetchedAt) >= 300_000 };
  };
}
