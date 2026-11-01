import type { Pool } from "pg";

export async function retainedPowerSnapshots(pool: Pool, leagueId: number, season: number, from: string, to: string) {
  // Use capture bounds for the index, then one retained capture per Pacific day.
  // Include the latest snapshot for its embedded seven-day player history.
  return pool.query(`WITH daily AS (
    SELECT DISTINCT ON ((captured_at AT TIME ZONE 'America/Los_Angeles')::date) id
    FROM league_snapshots WHERE league_id=$1 AND season=$2
      AND captured_at >= ($3::date::timestamp AT TIME ZONE 'America/Los_Angeles')
      AND captured_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')
    ORDER BY (captured_at AT TIME ZONE 'America/Los_Angeles')::date, captured_at DESC, id DESC
  ), latest AS (
    SELECT id FROM league_snapshots WHERE league_id=$1 AND season=$2 ORDER BY captured_at DESC,id DESC LIMIT 1
  ) SELECT payload FROM league_snapshots WHERE id IN (SELECT id FROM daily UNION SELECT id FROM latest)`,
  [leagueId, season, from, to]);
}
