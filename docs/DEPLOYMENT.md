# Railway deployment

Deployment configuration is included; no hosted environment has been provisioned automatically.

1. Create a Railway project and add PostgreSQL.
2. Add a web service from `andy98w/fantasy`, repository root `/`, config `railway.toml`. It builds the root `Dockerfile` and checks `/api/health`.
3. Add a second service from the same repo, root `/`, config path `worker/railway.toml`. It builds `worker/Dockerfile`, runs a one-shot sync every five minutes, and exits. Never configure the worker as an HTTP service.
4. Set `DATABASE_URL` on both services using Railway's private database connection reference. Set `ESPN_LEAGUE_ID`, `ESPN_SEASON`, and `ESPN_TEAM_ID` on both.
5. Set `ESPN_S2` and `ESPN_SWID` **only on the worker**. Do not put these in frontend variables, Docker build args, or GitHub repository variables.
6. On the web service, set `DATA_MODE=live` and use the HTTPS domain provided by Railway. The dashboard is public and requires no visitor account or password. ESPN authentication happens only in the worker.
7. Run the worker once. Confirm the expected team/player counts, then open the web domain and reconcile the matchup with ESPN.
8. Enable database backups and provider alerts for failed jobs; review usage after the first week.

`/api/health` only confirms the web process is reachable; it does not claim ESPN data is fresh. The dashboard reports snapshot age and the latest sync failure. The database uses an advisory lock to prevent overlapping jobs. Local development uses a filesystem lock.

Append-only snapshots preserve roster history and raw payloads for debugging. They contain private league data. Before long-term operation, set a retention policy (for example, hourly intraday snapshots for 30 days plus daily snapshots for the season). The first release deliberately does not delete historical data automatically. Monitor database growth.

The current job refreshes all data every five minutes. Once actual request volume and ESPN behavior are measured, split fast matchup/roster refreshes from daily full-player/schedule imports and use the `--news-only` command for independent headline updates. Do not increase polling frequency without measuring upstream load.

The web build removes Next.js-generated `.env` copies from standalone output; runtime credentials must be supplied by the host.

No Railway account credentials are included. Docker builds, cloud scheduling, and database connectivity must be verified in the deployment environment; passing local Next.js builds is not deployment validation.
