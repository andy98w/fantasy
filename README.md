# ninecat.

A read-only ESPN fantasy basketball dashboard for head-to-head nine-category leagues. Next.js + TypeScript on the web, Python ingestion and ranking jobs, PostgreSQL in production.

## First release

- Category matchup board, team rosters, standings, full player search, and category-value player details.
- Per-game 9-cat z-scores with volume-weighted shooting impact and reversed turnovers.
- Roster talent rankings with category heatmaps. These are **not weekly projections**.
- Read-only ESPN adapter with timeouts, bounded retries, pagination checks, roster reconciliation, and raw snapshots.
- RSS headline collection from ESPN and RotoWire, deduplication, and conservative player matching.
- Last-good-snapshot behavior, visible stale data, and fail-closed password protection for live data.
- Explicit fictional demo mode for development. No sample data silently replaces failed live imports.

## Run locally

Requires Node 22+ and Python 3.12+; Python 3.13 is used in CI and containers.

```sh
npm ci
uv sync --frozen
cp .env.example .env
npm run dev
```

If macOS sandboxing prevents Turbopack file watching, use `WATCHPACK_POLLING=true npm run dev -- --webpack`.

Open `http://127.0.0.1:3000`. Demo mode needs no ESPN credentials. `lib/demo.json` contains deterministic fictional players and stats; regenerate it with `uv run python -m worker.demo`.

Connect your private league using [the connection guide](docs/CONNECT_ESPN.md). Run `uv run python -m worker.sync --probe` to check access without saving league data, then `uv run python -m worker.sync` to import. This worker only issues GET requests to ESPN. PostgreSQL writes are internal storage operations, never league mutations.

## Verification

```sh
npm run typecheck
npm test
npm run build
uv run pytest -q
```

Unit tests cover shooting volume, turnovers, zero attempts, missing values, fixed reference pools, incomplete rosters, ESPN auth errors, repeated pagination, normalization, atomic writes, access checks, and snapshot validation. The initial authenticated import was verified locally: player and roster coverage passed, and all current matchup category win/tie totals and pooled shooting percentages reconciled with ESPN payloads. Independent screen-by-screen ESPN comparison and PostgreSQL/hosted integration verification remain before production launch.

## Hosting

See [Railway deployment](docs/DEPLOYMENT.md). The web and scheduled worker share a private PostgreSQL database. The initial access gate uses one shared league password over HTTPS; individual member accounts are a later milestone. Production refuses access if the password is missing.

## Structure

- `app/`, `components/`: responsive dashboard and server-rendered entry point.
- `lib/`: validated public snapshot contract, server-only storage reader, access checks.
- `worker/`: ESPN reads, normalization, rankings, news, transactional sync.
- `db/schema.sql`: append-only snapshots and sync history. Raw payloads remain server-side.
- `docs/`: setup, methodology, implementation milestones.

ESPN is an unofficial upstream interface with no guaranteed availability. Endpoint and stat mappings follow the community [espn-api](https://github.com/cwendt94/espn-api) project. The adapter uses direct HTTP to retain original payloads and enforce timeouts and coverage checks. News feeds provide limited headline coverage, not a complete article archive.
