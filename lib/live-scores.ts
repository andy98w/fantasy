import { z } from "zod";
import { matchupSchema, type Snapshot } from "./schema";
const feed = z.object({ leagueId: z.number(), season: z.number(), period: z.number(), fetchedAt: z.string().datetime({ offset: true }), matchups: z.array(matchupSchema) });
export function mergeLiveScores(snapshot: Snapshot, value: unknown, now = Date.now()): Snapshot {
  const parsed = feed.safeParse(value);
  if (!parsed.success) return snapshot;
  const live = parsed.data;
  const at = Date.parse(live.fetchedAt);
  if (live.leagueId !== snapshot.league.id || live.season !== snapshot.league.season || live.period !== snapshot.league.matchupPeriod ||
      at <= Date.parse(snapshot.syncedAt) || at > now + 60_000 || now - at > 15 * 60_000 || live.matchups.length !== snapshot.matchups.length) return snapshot;
  if (new Set(live.matchups.map(m => m.id)).size !== live.matchups.length || live.matchups.some(m => {
    const old = snapshot.matchups.find(x => x.id === m.id);
    return !old || m.period !== live.period || old.home.teamId !== m.home.teamId || old.away.teamId !== m.away.teamId;
  })) return snapshot;
  return { ...snapshot, matchups: live.matchups, matchupSyncedAt: live.fetchedAt };
}
