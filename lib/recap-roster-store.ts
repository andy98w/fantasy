import type { Pool } from "pg";

export function retainedRecapSnapshot(pool: Pool, leagueId: number, season: number, date: string) {
  // ESPN can retain yesterday's scoring period after midnight. Match its explicit
  // lineup date, allowing the following day's capture but never its new lineup.
  return pool.query(`SELECT payload FROM league_snapshots
    WHERE league_id=$1 AND season=$2
      AND captured_at >= ($3::date::timestamp AT TIME ZONE 'America/Los_Angeles')
      AND captured_at < (($3::date + 2)::timestamp AT TIME ZONE 'America/Los_Angeles')
      AND payload->'forecastSchedule'->>'lineupDate'=$3::text
      AND jsonb_typeof(payload->'forecastSchedule'->'lineups')='array'
    ORDER BY captured_at DESC,id DESC LIMIT 1`, [leagueId, season, date]);
}
