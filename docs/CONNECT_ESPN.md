# Connect the ESPN league

The screenshot identifies league `1834203755`, season `2027`, and team `3`. An unauthenticated request returned 401. The configured team ID comes from the URL, not the demo fixture.

## Session cookies

1. Open your league in Chrome while signed in to ESPN.
2. Open Developer Tools with Command–Option–I on macOS.
3. Choose **Application** (possibly under the `»` overflow menu).
4. Under **Storage → Cookies**, select the ESPN domain.
5. Copy the **Value** of `espn_s2` and `SWID`. Keep the braces around SWID.
6. Put those values into `.env` in the repository root, using a local editor:

```dotenv
ESPN_LEAGUE_ID=1834203755
ESPN_SEASON=2027
ESPN_TEAM_ID=3
ESPN_S2='your session cookie'
ESPN_SWID='{your SWID}'
DATA_MODE=demo
```

Do not send cookie values in chat, screenshots, issue reports, or commits. They are account credentials and may permit more than reading ESPN. This application only uses GET requests and keeps cookies inside the sync worker. `.env`, runtime data, and private snapshots are ignored by Git and excluded from container build contexts.

## Verify and import

```sh
uv run python -m worker.sync --probe
uv run python -m worker.sync
```

The probe reports access and scoring format without writing a snapshot. An import must verify all nine categories, complete player pagination, and roster ownership. The current scoring and matchup period are supplied explicitly to ESPN.

Without `DATABASE_URL`, the worker writes private files to `data/`, atomically preserving the last successful snapshot if a later request fails. With `DATABASE_URL`, it stores snapshots in PostgreSQL. The frontend uses the same configuration.

After a successful sync:

1. Change `DATA_MODE=live` in `.env`.
2. Restart `npm run dev`.
3. Open the dashboard; no website sign-in is required. Anyone with the hosted URL can view the imported league data.
4. Compare all team rosters, the nine current matchup totals, and the W–L–T record against ESPN. Check player ownership and free-agent coverage.

The dev server imports immediately and repeats five minutes after each attempt finishes. Open pages pick up the saved data automatically; there is no import button. Hosting uses the separate five-minute Railway cron worker instead. The last-updated timestamp always describes the last successful league import.

The initial local import has passed access, coverage, and matchup arithmetic checks. Repeat this reconciliation after changes to the connector or league settings. Do not assume a successful HTTP request proves every field is interpreted correctly.

If ESPN returns 401/403 again, update the cookies from your signed-in browser and retry. The existing dashboard remains on its last successful data with a warning. No automated ESPN login, password collection, browser-cookie extraction, or write operations are implemented.
