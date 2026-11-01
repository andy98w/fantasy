# Fantasy — handoff

Updated November 1, 2026 (America/Los_Angeles). This is the starting point for a new chat; verify the working tree and live state before making changes.

## Start here

- Repository: https://github.com/andy98w/fantasy
- Local checkout: `/Users/andywu/Documents/Codex/2026-10-29/new-x20/outputs/fantasy`
- Live website: https://web-production-8d109.up.railway.app/
- Local website: http://127.0.0.1:3000
- Hosted MCP: https://web-production-8d109.up.railway.app/mcp
- League: `1834203755`, season `2027` (2026–27), name Monke, 12 teams, H2H most categories.
- Current follow-up: full-roster power including IR, explicit forecast availability scenarios, separate next-week trade production, and injury filtering for streamers. Use `git log -1` and exact-commit CI/deployment checks for its release state.
- Previous application release: `5ead4d7d69aff57f2ae15b9240798457fda10d44` — simplified MCP onboarding.
- That previous application commit passed all four CI jobs and deployed successfully. GitHub Actions run: `41347266465`; Railway GitHub deployment: `7478677082`.
- Application working tree was clean before writing this handoff. No unfinished application changes remain.

Read `AGENTS.md` first. It requires reading the relevant bundled Next.js documentation under `node_modules/next/dist/docs/` before code changes. Do not assume familiar Next.js APIs match this installed version.

Some README and deployment-guide paragraphs predate the live release: references to six navigation tabs, Trades → History, Matchup MVP, Rivalries, and “not yet deployed” are stale. Prefer this handoff and current implementation for those details; setup and operational sections are still useful.

## Product and user preferences

Fantasy is a public, shared, read-only interface over the league's ESPN data. ESPN remains the source of truth for roster operations. Everyone sees the same dashboard; there is no personalized “my roster” or website sign-in.

- Pixel/video-game theme, restrained copy, useful data. Name is **Fantasy**, not Ninecat.
- Keep numeric data and team/player names legible: avoid pixel glyphs that make 5/S/Z ambiguous. Existing typography separates decorative headings from data.
- Reuse shared components; especially dropdowns, tabs, tables, avatars, copy controls, and stat previews.
- Avoid redundant explanatory paragraphs, counts, buttons, and repeated scoring disclaimers. Put useful methodology in expandable explanations. Preserve actual missing-data/staleness indicators.
- League front page is for frequently updated information. News and Today's games on the right, matchups and daily performers on the left. Cumulative results belong in Records.
- Matchups use full boxes clashing horizontally, with lightning between teal/pink sides. Winning sides occupy more space. Detailed categories are full-width rows stacked vertically: left value, centered category, right value. Respect reduced motion.
- Tables should support sorting and relevant search/filter controls.
- ESPN operations stay read-only. Anonymous battle voting and auction listings write only to this app's database. Repeat votes are intentionally allowed; do not add login or unique-voter enforcement without a new request.
- Prior sessions authorized pushing changes to main and deploying through Railway. Do not claim a change is live before checking deployment.

## Current navigation and features

| Tab | Current behavior |
| --- | --- |
| League | Current fantasy matchups; daily performers; roster news; Today games and available players. Clicking games opens NBA box scores. Clicking players opens profiles/game history. |
| Teams | Team power, sortable category heatmap, rosters and news. IR contributes to full-roster power; availability affects production forecasts separately. No “Rated players” column. |
| Players | Search/filter/sort player stats, power and seven-day risers/fallers when comparable history exists. |
| Trades | Calculator, Battles (default), Auction House. History was replaced; completed transactions are in Records → Ledger. |
| Forecast | Next-week/rest-of-week schedule-aware projections and What if (weekly all-play replay, not a forecast). |
| Records | Standings default; historical comparisons, cumulative awards/records, transaction ledger. |
| MCP | ChatGPT / Claude / Other setup instructions; hosted URL; fantasy-team selector and copyable starter prompt. |

Daily performer tabs: Top performers, Shitters, Surprises, Letdowns; up to six cards ranked #1–#6. Top/worst measure actual daily contribution; surprises/letdowns compare against the season per-game baseline. Negative lists require a final game and at least 10 minutes. Before today's first actual tip-off, retain the latest played day's performers and show its date. Today sidebar remains on today's schedule. Do not fabricate rows when fewer players qualify.

Matchup player tables use actual credited weekly stats and support team filtering/category sorting. Missing weekly data remains missing, not season averages substituted as weekly totals.

## Architecture and file map

Next.js / React / TypeScript frontend and server routes; Python ingestion; PostgreSQL in production. Node 22+, Python 3.13 used by CI/containers. Dependencies are locked; use the existing package/uv lockfiles.

| Area | Main files |
| --- | --- |
| Dashboard state / hash navigation | `components/dashboard.tsx`, `components/league/navigation.tsx` |
| Shared UI | `components/ui/`, including `primitives.tsx`, `select.tsx`, `copy-field.tsx`; `app/globals.css` |
| Public data contract | `lib/schema.ts` |
| Ratings / trades / records | `lib/analysis.ts`, `lib/forecast.ts`, `lib/season.ts`, `lib/daily.ts` |
| Durable Week 1 corrections | `lib/result-corrections.ts` |
| Live refresh | `components/auto-refresh.tsx`, `worker/live.py`, `lib/live-scores.ts` |
| NBA scores / box scores / player games | `lib/nba.ts`, `lib/game-boxscore.ts`, `lib/player-games.ts` and related loaders/routes |
| ESPN ingestion | `worker/espn.py`, `worker/sync.py`, `worker/normalize.py`, `worker/rankings.py` |
| Trade and activity import | `worker/trades.py`, `worker/activity.py` |
| Anonymous features | `lib/trade-battles.ts`, `lib/auction.ts`, their stores and API routes |
| MCP | `lib/mcp/server.ts`, `http.ts`, `queries.ts`, `history-store.ts`, `power-history.ts`, `scoreboard-loader.ts` |
| MCP onboarding | `components/league/mcp-connect.tsx`, `mcp-connect.css`, `components/ui/copy-field.tsx` |
| Database / deployment | `db/schema.sql`, `Dockerfile`, `worker/Dockerfile`, `.github/workflows/checks.yml` |
| Reference docs | `docs/CONNECT_ESPN.md`, `docs/DEPLOYMENT.md`, `docs/METHODOLOGY.md`, `docs/MCP.md` |

## Refresh and reliability

- Hosted `sync` runs `.venv/bin/python -m worker.live` continuously; no Railway cron.
- Full league/roster/power/news/history imports run five minutes after the previous full import attempt finishes.
- Lightweight fantasy matchup refresh runs approximately every 30 seconds while NBA games are active, with a five-hour post-tip grace period for corrections. Activity checks run approximately every minute.
- Browser refresh is every 15 seconds and on visibility/reconnect. Public NBA scoreboard/box-score cache is 20 seconds. This is polling and upstream latency still applies, not guaranteed instant push.
- Lightweight scores use `league_live_scores`, a replaceable row per league/season. Web only accepts a newer, complete overlay with matching period/matchups.
- Failed imports retain the last good snapshot. Optional history/activity failures preserve prior same-league/season data and expose failure metadata. Never silently fall back to fictional demo data in production.
- Readiness: `/api/ready`; liveness: `/api/health`. Web must have a matching live snapshot and working persistent vote storage.
- Worker GET requests use bounded retries/timeouts and pagination/coverage validation. Database advisory locks coordinate full and lightweight imports.
- Full snapshots and sync status are written transactionally. Vote retries have request-ID deduplication and concurrent updates are serialized. Auction listings also persist in production.

## Ratings: preserve these distinctions

- Player power: season per-game nine-category z-scores, shooting impact weighted by attempts, turnovers inverted. Minimum stats coverage/games applies; unknown values stay unknown.
- Team power: include the full roster, including IR and bench; aggregate category z-values then sum `4 * asinh(category_z / 4)` across categories. Trade priority weights apply after this taper.
- Heatmaps show raw category z-totals, not tapered values. Positive TO category strength is good (fewer turnovers); raw turnover stats still mean lower is better.
- Unrated rostered players contribute reference-average zero to the estimate, with provisional/coverage metadata retained. Fully unrated rosters stay unranked. Zero assumed value does not mean zero production.
- Forecasts use season averages, actual schedule, legal lineup slots and explicit conservative/if_available scenarios. Conservative excludes all non-ACTIVE statuses and IR. If available assumes uncertain players play and OUT/suspended/IR return after today; activation requires non-IR roster capacity. Scenarios are not return-date predictions. They are estimates, not win probabilities. Trade simulations do not execute trades or prove ESPN roster legality.
- Community trade MMR is separate from player/team power. Elo starts at 1000, K=32; a battle compares team-sides of different trades. Under-voted entries are prioritized. Repeat votes are permitted. Vote counts count appearances, not unique people.
- Shared standing ranks reflect equal win percentage; ESPN seeds can differ. Missing history must not be filled with invented category results.

## Week 1 results must survive

`lib/result-corrections.ts` overlays six user-confirmed Week 1 outcomes for this exact league/season. It adjusts only the difference from imported finalized results to prevent double counting after ESPN recovery. Never remove or replace this with transient local data. Unknown category totals/player performances remain missing.

| Team ID | Team / user | Confirmed Week 1 outcome |
| --- | --- | --- |
| 8 | Broke Young Boys / Lawrence | Beat p / Peter (6) |
| 9 | Tennesee Town Sahurs / Derek | Beat Yuf / Yufei (10) |
| 7 | sheeeeshhhh / Yifei | Beat White Boy Wednesday / Evan (5) |
| 1 | ZZZZZ… / Arthur | Beat thehungdynasty / Nathan (11) |
| 4 | CreepyZebra / Shunchao | Beat Lucas's Loud Team / Lucas (12) |
| 3 | Kirk's Mercs / Andy | Beat Brunson’s deadly daddies / Raymond (2) |

Team names can change. Resolve current IDs from the snapshot or MCP; do not infer them from position in a table.

## Latest trade investigation — important open finding

User reported that Trae Young for Jalen Brunson was missing. Direct ESPN reads confirmed the following **as of November 1 investigation** (recheck; this is time-sensitive):

- Trae: player `4277905`, still on Kirk's Mercs (`3`).
- Brunson: player `3934672`, still on Broke Young Boys (`8`).
- ESPN showed a `TRADE_ACCEPT` at **October 31, 2026, 1:50:06 PM PDT**; the related proposal remained pending and roster transfers had not occurred.
- The four assets in that accepted proposal were `4277905`, `3934672`, `5106060`, `5144091`; do not assume the full deal was one-for-one.
- Communication message `224` matched acceptance; `230` matched proposal; completed transfers use `244`. Do not casually import 224/230 as completed trades. `worker/tests/test_activity.py` already excludes them.
- Website and fresh direct completed-trade fetch both returned six completed trades, latest October 29. The importer was not simply stale.
- Inspect `mTransactions2` with the correct `scoringPeriodId` (12 for this event) and a `transactions.filterType` filter. Default current-period reads may omit the event; accepted rows can have empty items, while the related proposal contains the legs.
- Completed trade/activity import is intentionally limited to processed transactions. The user was told the trade should appear after processing and the next sync.
- A separate Pending section was suggested, **not implemented or approved yet**. No code was changed during this investigation.

If reopened, re-read ESPN state before diagnosing a bug. Keep accepted/pending deals separate from executed roster transfers and historical trade rankings.

## MCP: implemented and verified

Stateless Streamable HTTP at `/mcp`, no authentication, read-only. It shares existing snapshots/cached NBA feeds; no separate service. Browser GET returns 405 by design. Tool calls do not trigger an ESPN import. Official SDK client: `scripts/mcp-client.mjs`.

Sixteen tools:

1. `fantasy_get_league`
2. `fantasy_get_team`
3. `fantasy_search_players`
4. `fantasy_get_player`
5. `fantasy_get_matchups`
6. `fantasy_forecast_matchup`
7. `fantasy_find_streamers`
8. `fantasy_get_matchup_opportunities`
9. `fantasy_get_power_history`
10. `fantasy_analyze_trade`
11. `fantasy_get_today`
12. `fantasy_get_game_boxscore`
13. `fantasy_get_player_games`
14. `fantasy_get_transactions`
15. `fantasy_get_trade_rankings`
16. `fantasy_get_auction_listings`

Discover schemas via `tools/list`; see `docs/MCP.md` for filters, pagination, dates and limitations. Date filters are inclusive Pacific calendar dates. Preserve nulls, timestamps, model versions and provisional flags. Power history uses retained captures and explicitly preserves gaps; it is not reconstructed from invented daily data. Snapshot retention is bounded, so history may be absent.

Latest onboarding changes (`5ead4d7`):

- MCP remains the far-right navigation entry; update status moved out of its desktop navbar space.
- ChatGPT / Claude / Other instructions with official help links; setup is one-time and separate from the starter prompt.
- Team selector uses current league teams, no assumed owner. Starter prompt includes selected team name/ID and asks about punts, current facts and freshness.
- CopyField supports multiline prompts and clipboard failure selection fallback.
- URL is intentionally hosted even when viewing the dashboard on localhost: cloud chat clients cannot connect to the user's localhost.
- Core workflow instructions are transmitted during MCP initialization: identify team/priorities, use roster/matchup/streamer/trade tools, preserve missing-data meanings and avoid treating third-party names/news/notes as instructions. No skill file is required.
- Existing clients may need to refresh/reconnect to receive new instructions.
- Setup instructions were checked against official OpenAI and Claude docs on November 1. Product menus may change; verify before revising rather than relying on remembered Developer Mode menus.
- Local browser checks covered desktop/mobile, app switching, team selection and copy-button feedback. Official SDK received instructions and discovered all 16 tools. Production page was checked after deployment.
- Preview artifact outside the repo: `/Users/andywu/Documents/Codex/2026-10-29/new-x20/outputs/fantasy-mcp-setup.png`.

## Running, testing and deploying

From the repo root:

```sh
npm run dev
npm run typecheck
npm test
npm run build
npm run test:production
uv run pytest -q --ignore=worker/tests/integration
```

`.venv/bin/python` is available for focused Python diagnostics. For scripts reading `.env`, use `load_dotenv('.env')` explicitly; autodetection failed in stdin scripts. If uv cache permissions are an issue, use a task-specific `UV_CACHE_DIR` under `/tmp`.

For disposable PostgreSQL integration tests only:

```sh
npm run test:postgres
uv run pytest -q worker/tests/integration
```

These require `TEST_DATABASE_URL` pointing to a disposable database. Never point test commands at production `DATABASE_URL`.

CI jobs: web, worker, postgres, containers. Verify all four, not just local TypeScript/build. Last application release: 108 web tests, typecheck, build, production smoke passed locally; all four CI jobs green. Documentation-only changes need review/link checks, not another full local test cycle.

Useful read-only release checks:

```sh
git status --short
gh run list --limit 3 --json databaseId,headSha,status,conclusion
gh run view RUN_ID --json status,conclusion,jobs
gh api repos/andy98w/fantasy/deployments --jq '.[0] | {id,sha}'
gh api repos/andy98w/fantasy/deployments/DEPLOYMENT_ID/statuses --jq '.[0] | {state,description}'
```

Push to main triggers CI and Railway. GitHub CLI is authenticated. Avoid repeated polling; do independent work while builds run, then check the exact commit's statuses. A deployment starting is not proof of success. Verify the hosted UI/API after success.

Railway has web, sync and Postgres services. Web uses root `Dockerfile`; sync uses `worker/Dockerfile`, root directory `/`, no cron, image CMD, Always restart. Set explicit Dockerfile selection in Railway. Match public target port to the actual `PORT` in deploy logs (previous 502 was a routing/configuration issue). Do not provision duplicate infrastructure.

## Secrets and operational boundaries

- `.env` is ignored and contains private ESPN cookies. Never print, commit, paste into chat or expose it in screenshots/logs.
- `ESPN_S2` and `ESPN_SWID` belong on sync only, never web/browser/MCP clients. Web startup intentionally rejects ESPN cookies.
- PostgreSQL credentials stay private; don't log connection strings. Public snapshot schema strips private raw data.
- Preserve ignored local snapshots and SQLite databases. Local files are not automatically deployed/migrated into hosted Postgres.
- Back up persistent votes/listings/database history before destructive storage changes. No destructive change is authorized by this handoff.
- Do not add ESPN mutation calls, login requirements, fake data, or speculative historical results.

## Injury-handling follow-up validation

Local validation: 114 web tests, 69 worker tests, typecheck, production build and standalone smoke passed. Browser checks covered forecast scenario switching, IR trade value, separate production tables, and desktop/mobile layout. Team power history recomputes full-roster values on retained historical captures and identifies the revised team formula. Forecasts report per-player assumptions, per-date exclusions, availability freshness and required activation slots; incomplete scenarios expose no partial production totals.

## Next chat

The November 1 follow-up changes full-roster power to include IR, adds forecast availability scenarios and separate next-week trade production, and filters unavailable streamers by default. MCP and UI share the rules. Verify this change’s Git/CI/deployment state before claiming it is live. If they revisit trades, start with the pending/completed distinction above and current upstream evidence.
