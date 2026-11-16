import { z } from "zod";
import { elapsedTime } from "./shots";

export type GamePlay = {
  id: string; period: number; clock: string; elapsed: number; sequence: number;
  text: string; teamId: string | null; scoring: boolean;
  awayScore: number | null; homeScore: number | null;
};
export type PlayByPlayReport = { available: boolean; plays: GamePlay[]; skipped: number };
const score = z.number().int().nonnegative().nullish().catch(null);
const playSchema = z.object({
  id: z.string().min(1), text: z.string().trim().min(1),
  period: z.object({ number: z.number().int().min(1).max(20) }),
  clock: z.object({ displayValue: z.string() }),
  sequenceNumber: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional().catch(undefined),
  team: z.object({ id: z.string() }).nullish(),
  scoringPlay: z.boolean().optional(), awayScore: score, homeScore: score,
});
export const playPeriodLabel = (period: number) => period <= 4 ? `Q${period}` : `OT${period - 4}`;

/** Keep all event types, including neutral period markers; never invent scores. */
export function normalizePlayByPlay(payload: unknown, teamIds: string[]): PlayByPlayReport {
  const raw = (payload as { plays?: unknown[] } | null)?.plays;
  if (!Array.isArray(raw)) return { available: false, plays: [], skipped: 0 };
  const plays = new Map<string, GamePlay>();
  let skipped = 0;
  raw.forEach((value, index) => {
    const parsed = playSchema.safeParse(value);
    if (!parsed.success) { skipped++; return; }
    const p = parsed.data, elapsed = elapsedTime(p.period.number, p.clock.displayValue);
    if (elapsed === null || (p.team && !teamIds.includes(p.team.id))) { skipped++; return; }
    const sequence = Number(p.sequenceNumber ?? index);
    plays.set(p.id, { id: p.id, period: p.period.number, clock: p.clock.displayValue, elapsed,
      sequence: Number.isSafeInteger(sequence) ? sequence : index, text: p.text,
      teamId: p.team?.id ?? null, scoring: p.scoringPlay ?? false,
      awayScore: p.awayScore ?? null, homeScore: p.homeScore ?? null });
  });
  return { available: true, plays: [...plays.values()].sort((a, b) => a.period - b.period || a.elapsed - b.elapsed || a.sequence - b.sequence), skipped };
}

export function selectPlays(report: PlayByPlayReport, period: string, newestFirst: boolean) {
  const rows = report.plays.filter(play => period === "all" || String(play.period) === period);
  return newestFirst ? rows.reverse() : rows;
}
