import { snapshotSchema, type Snapshot, type Player, type ForecastSchedule } from "./schema";

export type RecapRoster = {
  date: string;
  capturedAt: string;
  players: Player[];
  lineups: NonNullable<ForecastSchedule["lineups"]>;
};

/** Only the explicitly dated roster is evidence of historical lineup membership. */
export function recapRosterFromSnapshot(value: unknown, current: Snapshot, date: string): RecapRoster | undefined {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) return;
  const saved = parsed.data, schedule = saved.forecastSchedule;
  if (saved.league.id !== current.league.id || saved.league.season !== current.league.season) return;
  const recovered = saved.recapRosters?.find(roster => roster.date === date);
  if (recovered) return recovered;
  if (schedule?.lineupDate !== date || !schedule.lineups) return;
  const ids = new Set(schedule.lineups.flatMap(team => team.entries.map(entry => entry.playerId)));
  return { date, capturedAt: saved.syncedAt, lineups: schedule.lineups, players: saved.players.filter(p => ids.has(p.id)) };
}
