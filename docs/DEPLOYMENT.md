# Deploy Fantasy on Railway

Prepared for deployment; nothing has been published by this setup. Use one Railway project containing **web**, **sync**, and **Postgres**. Both application services build from this repository. No ESPN write endpoints or visitor accounts are needed; anonymous trade votes are the app's own database writes.

## Release checks

Run from the repository root:

```sh
npm ci
uv sync --frozen
npm run typecheck
npm test
uv run pytest -q --ignore=worker/tests/integration
npm run build
npm run test:production
```

The production smoke test starts an isolated standalone server on port 3099, uses fictional demo data and a temporary vote database, checks assets and API responses, then stops it. It does not contact ESPN or use `.env`. Override `SMOKE_PORT` if needed. Demo mode deliberately fails `/api/ready`.

GitHub Actions additionally builds both Linux containers and runs PostgreSQL integration tests against a disposable database. Those tests cover concurrent votes, retry deduplication, league/season isolation, sync transactions, and preservation of the last successful snapshot after a database write failure. Require all four jobs in `.github/workflows/checks.yml` to pass before release. Local Next.js build success alone does not verify Docker or PostgreSQL.

To run database checks manually, set `TEST_DATABASE_URL` to a **disposable test database**, then run:

```sh
npm run test:postgres
uv run pytest -q worker/tests/integration
```

Tests create and remove unique schemas, never use `DATABASE_URL`, and make no ESPN requests. The integration database user needs permission to create schemas.

## Service settings

| Setting | web | sync |
| --- | --- | --- |
| Repository | `andy98w/fantasy` | `andy98w/fantasy` |
| Root directory | `/` | `/` |
| Builder | Dockerfile | Dockerfile |
| Dockerfile | `Dockerfile` | `worker/Dockerfile` |
| Start command | Leave unset; use image CMD | Leave unset; use image CMD |
| Public networking | HTTPS domain, target port matching deploy logs | None |
| Health check | `/api/ready` | None |
| Schedule | Always running | Custom cron: `*/5 * * * *` |
| Restart policy | On Failure, 3 retries | Never (set automatically for cron) |

Set these values directly in each service's Railway Settings. New services cannot opt into Railway's deprecated Config as Code, so do not rely on the checked-in TOML files being applied. In particular, explicitly set sync's Dockerfile path to `worker/Dockerfile`; automatic detection selects the root web Dockerfile. Save the custom cron expression before deploying the staged changes. Existing legacy Config as Code services can use the TOML files until Railway retires support.

Keep both services and Postgres in the same environment/region. Do not set the sync service root to `/worker`; it needs the root dependency files and database schema. Leave application sleeping disabled for the web service so scheduled data updates remain visible without cold starts. Use the platform-provided `PORT`; the image defaults to 3000. When generating the public domain, match its target port to the deploy log (for example, `0.0.0.0:8080` means target port **8080**). Do not assume the container default overrides Railway’s `PORT`.

Railway's [config file path is independent of the root directory](https://docs.railway.com/builds/build-configuration). Its [cron scheduler](https://docs.railway.com/cron-jobs) supports a minimum five-minute interval and skips a run if the previous process has not exited. Sync is a one-shot command that closes its database connection when done.

## Runtime variables

Set these in Railway's service Variables panel. Do not put secrets in Git, Docker build arguments, or `NEXT_PUBLIC_*` variables. Replace `Postgres` in the reference below if your database service has a different name.

| Variable | web | sync |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | `${{Postgres.DATABASE_URL}}` |
| `RAILWAY_DOCKERFILE_PATH` | `/Dockerfile` | `/worker/Dockerfile` |
| `DATA_MODE` | `live` | Not needed |
| `ESPN_LEAGUE_ID` | `1834203755` | `1834203755` |
| `ESPN_SEASON` | `2027` | `2027` |
| `ESPN_TEAM_ID` | Not needed | `3` (legacy import field) |
| `ESPN_S2` | **Do not set** | Signed-in ESPN cookie, private secret |
| `ESPN_SWID` | **Do not set** | Signed-in ESPN cookie, private secret |
| `SNAPSHOT_RETENTION_DAYS` | Not needed | `30` (enable bounded storage for the new database) |

Set the [explicit Dockerfile path variable](https://docs.railway.com/builds/dockerfiles#custom-dockerfile-path) as well as the service setting so each service builds the intended image. The web container refuses to start with demo mode, missing database/league identity, or ESPN cookies. The sync image requires `DATABASE_URL`; it cannot silently save into ephemeral local storage. No `SNAPSHOT_PATH` or `BATTLE_DB_PATH` is needed in Railway. Keep PostgreSQL on private networking; only web needs a public domain.

## First launch

1. Commit and push the intended release; confirm the four CI jobs pass. Make sure the latest local features are included in that commit.
2. Create the project and Postgres, then create **sync** with the settings and private variables above.
3. Deploy sync and trigger one run. Its idempotent schema setup creates the snapshot, sync-status, and battle tables. Look for an import summary with 12 teams and the expected player/matchup counts. Raw ESPN responses and credentials are never logged.
4. Create/deploy **web** with its variables. `/api/ready` returns 200 only when a valid matching live snapshot and vote storage can be read. Deploy sync first: an empty database correctly fails web readiness.
5. Once readiness passes, generate the web service's Railway HTTPS domain. This makes the imported league viewable by anyone with the URL, without signing in.
6. Check League, Teams, Players, Trades, Rivalries, and Records on desktop/mobile. Compare the current matchup with ESPN and check that Today's games load. With at least two completed trades, submit a battle vote and verify the MMR persists after a web restart; this is a real counted vote.
7. Confirm another scheduled sync completes and the displayed update time advances. Configure database backups and failed-job alerts before sharing the link.

The deployment [health check](https://docs.railway.com/deployments/healthchecks) checks readiness during rollout. Add a recurring uptime monitor if you want ongoing alerts; deployment health checks alone are not continuous monitoring.

## Storage and continuity

- PostgreSQL stores league snapshots, sync status, power history, and anonymous trade votes. Web and worker restarts do not erase them.
- The worker saves the snapshot and successful sync status in one transaction. A failed import retains the last successful snapshot. The database advisory lock prevents overlapping syncs.
- Seven-day power history is embedded in each latest snapshot; it survives deployment/restarts **once collected in PostgreSQL**. Starting with an empty hosted database starts a fresh seven-day history window. No fake historical changes are generated.
- Local ignored `data/` files are not uploaded. Local SQLite votes and local power history do **not** migrate automatically. Preserve them locally; decide on a separate, validated import if that history must carry over.
- Back up all four tables, including `battle_ratings` and `battle_votes`, and verify a restore before deleting any old snapshots. Snapshot rollback must not erase votes.
- With `SNAPSHOT_RETENTION_DAYS=30`, successful syncs keep the 24 newest snapshots plus the latest snapshot per UTC day within 30 days, and only the newest available raw response (keeping its snapshot if necessary). Old sync logs expire after 30 days; votes are never pruned. Cleanup is scoped to the current league/season and commits with the successful import. The latest snapshot carries historical matchups and the rolling power window. Omit/set `0` to disable retention; then snapshots/raw data grow on every import. Back up an existing database before enabling retention. The initial local payload is roughly 9 MB raw per import, so unbounded storage is unsuitable for regular polling. Monitor actual database size and backups.

## Failure handling and rollback

`/api/health` is process liveness. `/api/ready` checks saved league data and vote storage; it exposes only a generic status, not credentials or upstream payloads. ESPN freshness is separate: a temporary upstream failure keeps the last data visible and the dashboard shows its age/failure state. Do not restart a healthy web service simply because ESPN is down.

If ESPN denies access, renew cookies **only on sync** and trigger another job. If readiness fails, check database connectivity, a successful first sync, and matching league/season variables. If cron stops progressing, check whether the prior run is still active. Do not increase polling frequency to fix missing data.

To roll back a bad release, redeploy the previous known-good web/sync commit while retaining the database. This release uses additive, idempotent schema creation. Future destructive schema changes need a backup and a separate migration/rollback plan. Keep both services on compatible snapshot versions.

## Verification status

The local production build and standalone smoke check can be run without hosting credentials. Docker images, real PostgreSQL integration, private networking, scheduled cloud runs, and the final HTTPS domain still require CI/hosting verification. No Railway project has been provisioned by this preparation.
