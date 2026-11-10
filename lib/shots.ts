import { z } from "zod";
import type { BoxTeam } from "./game-boxscore";

export type Shot = {
  id: string; gameId: string; playerId: number; playerName: string; teamId: string;
  period: number; clock: string; elapsed: number; made: boolean; points: 2 | 3;
  x: number | null; y: number | null; text: string; teamAttempt?: boolean;
};
export type ShotReport = { available: boolean; shots: Shot[]; duration: number; expected: Record<string, number>; skipped: number };
const playSchema = z.object({
  id: z.string().min(1), shootingPlay: z.literal(true), pointsAttempted: z.union([z.literal(2), z.literal(3)]),
  type: z.object({ text: z.string().optional() }).optional(),
  scoringPlay: z.boolean(), text: z.string(), team: z.object({ id: z.string() }),
  participants: z.array(z.object({ athlete: z.object({ id: z.string().regex(/^\d+$/) }) })).min(1),
  period: z.object({ number: z.number().int().min(1).max(20) }), clock: z.object({ displayValue: z.string() }),
  coordinate: z.object({ x: z.number(), y: z.number() }).nullish(),
});
export const periodStart = (period: number) => period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
export function elapsedTime(period: number, clock: string): number | null {
  const match = clock.match(/^(?:(\d{1,2}):)?(\d{1,2}(?:\.\d+)?)$/);
  if (!match || !Number.isInteger(period) || period < 1 || period > 20) return null;
  const remaining = Number(match[1] ?? 0) * 60 + Number(match[2]);
  const length = period <= 4 ? 720 : 300;
  if (Number(match[2]) >= 60 || remaining > length) return null;
  return periodStart(period) + length - remaining;
}
export function normalizeShots(payload: unknown, gameId: string, teams: BoxTeam[]): ShotReport {
  const raw = payload as { plays?: unknown[] };
  const players = new Map(teams.flatMap(team => team.players.map(p => [p.id, { ...p, teamId: team.id }] as const)));
  const expected: Record<string, number> = {};
  for (const [id, p] of players) {
    const pair = p.stats["fieldGoalsMade-fieldGoalsAttempted"]?.match(/^(\d+)-(\d+)$/);
    if (pair) expected[String(id)] = Number(pair[2]);
    else if (p.didNotPlay) expected[String(id)] = 0;
  }
  const shots = new Map<string, Shot>();
  const heaves = new Set<string>();
  let skipped = 0, periods = 4;
  for (const value of Array.isArray(raw.plays) ? raw.plays : []) {
    const candidate = value as Record<string, unknown> | null;
    if (!candidate || candidate.shootingPlay !== true || ![2, 3].includes(Number(candidate.pointsAttempted))) continue;
    const parsed = playSchema.safeParse(value);
    if (!parsed.success) { skipped++; continue; }
    const p = parsed.data, id = Number(p.participants[0].athlete.id), player = players.get(id);
    const elapsed = elapsedTime(p.period.number, p.clock.displayValue);
    if (!player || player.teamId !== p.team.id || elapsed === null) { skipped++; continue; }
    // ESPN's feet-based chart has the basket at (25, 0), baseline at y=-5.25.
    // Sentinel/missing coordinates remain unplotted; never turn them into a rim shot.
    const located = p.coordinate && p.coordinate.x >= 0 && p.coordinate.x <= 50 && p.coordinate.y >= -5.25 && p.coordinate.y <= 88.75;
    const remaining = periodStart(p.period.number) + (p.period.number <= 4 ? 720 : 300) - elapsed;
    if (!p.scoringPlay && p.period.number <= 3 && remaining <= 3 && located && Math.hypot(p.coordinate!.x - 25, p.coordinate!.y) >= 36 && /heave/i.test(p.type?.text ?? "")) heaves.add(p.id);
    else heaves.delete(p.id);
    periods = Math.max(periods, p.period.number);
    shots.set(p.id, { id: p.id, gameId, playerId: id, playerName: player.name, teamId: p.team.id,
      period: p.period.number, clock: p.clock.displayValue, elapsed, made: p.scoringPlay, points: p.pointsAttempted,
      x: located ? p.coordinate!.x : null, y: located ? p.coordinate!.y : null, text: p.text });
  }
  // Only exclude explicitly tagged heaves when they reconcile exactly with
  // the official player's attempts. Other discrepancies remain visible.
  for (const id of players.keys()) {
    const own = [...shots.values()].filter(s => s.playerId === id), candidates = own.filter(s => heaves.has(s.id));
    if (candidates.length && expected[String(id)] === own.length - candidates.length)
      for (const shot of candidates) shot.teamAttempt = true;
  }
  return { available: Array.isArray(raw.plays), shots: [...shots.values()].sort((a, b) => a.elapsed - b.elapsed || a.id.localeCompare(b.id, undefined, { numeric: true })),
    duration: periodStart(periods) + (periods <= 4 ? 720 : 300), expected, skipped };
}
export const shotZone = (shot: Shot) => {
  if (shot.x === null || shot.y === null) return "Unlocated";
  if (shot.y > 41.75) return "Backcourt";
  if (shot.points === 3) return Math.abs(shot.x - 25) >= 22 && shot.y <= 8.95 ? "Corner 3" : "Above-break 3";
  return Math.hypot(shot.x - 25, shot.y) <= 4 ? "At rim" : "Other 2PT";
};
export function shootingTotals(allShots: Shot[]) {
  const shots = allShots.filter(s => !s.teamAttempt);
  const made = shots.filter(s => s.made).length, threes = shots.filter(s => s.points === 3), made3 = threes.filter(s => s.made).length;
  return { made, attempted: shots.length, made3, attempted3: threes.length,
    fg: shots.length ? made / shots.length : null, efg: shots.length ? (made + 0.5 * made3) / shots.length : null };
}
