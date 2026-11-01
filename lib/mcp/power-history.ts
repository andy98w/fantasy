import { z } from "zod";
import { snapshotSchema, type Snapshot } from "../schema";
import { teamRating } from "../analysis";
import { nbaDate } from "../nba";
import { dateInput } from "./queries";

export type HistoryRequest = { kind: "player" | "team"; id: number; from: string; to: string };
export type PowerPoint = { date: string; capturedAt: string; power: number | null; model: Record<string, unknown>; categories?: Record<string, number>; provisional?: boolean; rosterIds?: number[] };
export type PowerHistory = { source: "database" | "local" | "demo"; points: PowerPoint[]; skippedSnapshots: number };
const modelOf = (s: Snapshot) => ({ version: s.model.version, basis: s.model.basis, minimumGames: s.model.minimumGames, poolRule: s.model.poolRule });
const embeddedSchema = z.object({ powerHistory: z.array(z.object({ date: dateInput, capturedAt: z.iso.datetime({ offset: true }), model: z.record(z.string(), z.unknown()), ratings: z.record(z.string(), z.number().finite().min(0).max(100).nullable()) })).default([]) });
// Validate each saved snapshot independently. Never backfill a historical roster
// with today's players or synthesize dates with no retained capture.
export function extractPowerHistory(raw: unknown[], current: Snapshot, request: HistoryRequest, source: PowerHistory["source"]): PowerHistory {
  const points = new Map<string, PowerPoint>();
  let skippedSnapshots = 0;
  const insert = (point: PowerPoint) => {
    if (point.date < request.from || point.date > request.to) return;
    if (!points.has(point.date) || Date.parse(point.capturedAt) > Date.parse(points.get(point.date)!.capturedAt)) points.set(point.date, point);
  };
  for (const payload of raw) {
    const parsed = snapshotSchema.safeParse(payload);
    if (!parsed.success || parsed.data.mode !== current.mode || parsed.data.league.id !== current.league.id || parsed.data.league.season !== current.league.season) { skippedSnapshots++; continue; }
    const s = parsed.data;
    if (request.kind === "player") {
      const embedded = embeddedSchema.safeParse(payload);
      for (const point of embedded.success ? embedded.data.powerHistory : []) {
        if (nbaDate(new Date(point.capturedAt)) === point.date && String(request.id) in point.ratings)
          insert({ date: point.date, capturedAt: point.capturedAt, power: point.ratings[String(request.id)], model: point.model });
      }
      const player = s.players.find(p => p.id === request.id);
      if (player) insert({ date: nbaDate(new Date(s.syncedAt)), capturedAt: s.syncedAt, power: player.power, model: modelOf(s) });
    } else if (s.teams.some(t => t.id === request.id)) {
      const roster = s.players.filter(p => p.teamId === request.id), rating = teamRating(roster);
      insert({ date: nbaDate(new Date(s.syncedAt)), capturedAt: s.syncedAt, power: rating.score, model: { ...modelOf(s), teamFormula: "4*asinh(category/4); full roster including IR; v2" },
        categories: rating.categories, provisional: rating.provisional, rosterIds: roster.map(p => p.id) });
    }
  }
  return { source, points: [...points.values()].sort((a,b) => a.date.localeCompare(b.date)), skippedSnapshots };
}
