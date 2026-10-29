CREATE TABLE IF NOT EXISTS league_snapshots (
  id bigserial PRIMARY KEY,
  league_id bigint NOT NULL,
  season integer NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  raw_payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS league_snapshots_latest ON league_snapshots (league_id, season, captured_at DESC);
CREATE TABLE IF NOT EXISTS sync_runs (
  id bigserial PRIMARY KEY,
  league_id bigint NOT NULL,
  season integer NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL,
  message text NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_runs_latest ON sync_runs (league_id, season, finished_at DESC);
