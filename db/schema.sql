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

-- Anonymous trade battles. Each explicit vote counts; request IDs only deduplicate transport retries.
CREATE TABLE IF NOT EXISTS battle_ratings (
  scope TEXT NOT NULL, mode TEXT NOT NULL, entry_id TEXT NOT NULL,
  rating DOUBLE PRECISION NOT NULL DEFAULT 1000,
  votes INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, mode, entry_id)
);
CREATE TABLE IF NOT EXISTS battle_votes (
  scope TEXT NOT NULL, request_id TEXT NOT NULL, mode TEXT NOT NULL,
  left_id TEXT NOT NULL, right_id TEXT NOT NULL, winner_id TEXT NOT NULL,
  result TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (scope, request_id)
);

-- One replaceable live scoreboard per league; do not grow full snapshot history at live cadence.
CREATE TABLE IF NOT EXISTS league_live_scores (
  league_id bigint NOT NULL,
  season integer NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (league_id, season)
);

-- Shared, anonymous trade-block listings; one current listing per player and league season.
CREATE TABLE IF NOT EXISTS auction_listings (
  scope TEXT NOT NULL, player_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
  note TEXT NOT NULL, active INTEGER NOT NULL, version INTEGER NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY (scope, player_id)
);
