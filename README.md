# Fantasy

A read-only ESPN fantasy basketball dashboard for head-to-head nine-category leagues. Next.js + TypeScript on the web, Python ingestion and ranking jobs, PostgreSQL in production.

## First release

- Category matchup board, team rosters, standings, full player search, and category-value player details.
- Per-game 9-cat z-scores with volume-weighted shooting impact and reversed turnovers.
- Searchable player power leaderboard, visible overall player ranks, and ESPN headshots with initials as a fallback.
- Seven-day power risers/fallers and a sortable change column, following the player filters. Successful imports retain the latest published rating per Pacific calendar day for eight days. Comparisons require the exact date seven days earlier and the same rating model; newly rated players show New. Cards stay hidden until a valid baseline exists. History persists with the snapshot and is stripped from the browser payload.
- Fantasy team logos from ESPN, including custom uploads, with abbreviation fallbacks. Private uploads are fetched by the worker and cached as bounded raster images in the snapshot; ESPN cookies stay server-side.
- Team power estimates with coverage, shared tied ranks, and category heatmaps. Incomplete rosters use explicit reference-average assumptions. These are **not weekly projections**.
- Read-only trade calculator: two teams, multi-player exchanges, before/after categories, roster counts, coverage, and independent punts/priorities. Draft selections survive navigation within the app.
- Read-only ESPN adapter with timeouts, bounded retries, pagination checks, roster reconciliation, and raw snapshots.
- Today panel below roster news: NBA games and scores, plus league free agents/waivers playing today, category-strength filters, and a not-started filter.
- RSS headline collection from ESPN and RotoWire, deduplication, and conservative player matching.
- Last-good-snapshot behavior, visible stale data, and public access without a website sign-in.
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

In live mode, `npm run dev` also starts the sync worker: it imports immediately, then waits five minutes after each completed attempt. Failed imports retain the last successful snapshot and retry. Stopping the dev server stops this worker. Demo mode never polls ESPN. Open live dashboards refresh every 15 seconds; public NBA scores and box scores share a 20-second server cache. They also refresh and when a tab becomes visible or reconnects, preserving filters and open player details. Visitors never trigger ESPN imports.

The Today panel reads ESPN’s public NBA scoreboard on the web server without cookies. It uses a shared Pacific calendar day and displays times in PT, requesting both overlapping ESPN dates to include late games. Requests are coalesced and cached for one minute per server process. On failure, the last successful same-day scores remain for up to 15 minutes with a stale label; otherwise the panel shows an error. Scoreboard failures do not affect the imported fantasy league. Demo mode makes no scoreboard requests.

Available players must be unrostered and marked FREEAGENT or WAIVERS in the league snapshot. The default sort uses underlying player power; unrated players appear last. Selecting a category shows measured above-average contributors and sorts by that category’s value (turnovers already inverted). Not started requires a scheduled game with a future tip-off; postponed/cancelled games never produce suggestions. NBA team membership indicates the team’s game, not a guarantee that an injured player will participate or that a waiver claim can clear in time.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:production
uv run pytest -q --ignore=worker/tests/integration
```

Unit tests cover shooting volume, turnovers, zero attempts, missing values, fixed reference pools, incomplete rosters, ESPN auth errors, repeated pagination, normalization, atomic writes and snapshot validation. The initial authenticated import was verified locally: player and roster coverage passed, and all current matchup category win/tie totals and pooled shooting percentages reconciled with ESPN payloads. Independent screen-by-screen ESPN comparison and PostgreSQL/hosted integration verification remain before production launch.

## Hosting

See [Railway deployment](docs/DEPLOYMENT.md). The web and scheduled worker share a private PostgreSQL database. Container startup rejects missing production configuration, and `/api/ready` checks saved league data and vote storage before Railway accepts a deployment. GitHub Actions includes PostgreSQL integration checks and builds both containers. The dashboard is public: anyone with the URL can view the imported league data without signing in. ESPN cookies stay exclusively in the sync worker; database credentials and raw upstream payloads remain server-side.

## Frontend

This is a shared league dashboard with six tabs: League, Teams, Players, Trades, Forecast, and Records. League combines current matchups, daily performers, roster-relevant news, and a Today panel; cumulative standings and awards live in Records. Open matchup details from its cards. Teams combines the power heatmap with roster pages and team news; Players includes the player leaderboard. Record ranks share ties by win percentage; ESPN seeds remain separately labeled in team profiles. The legacy `myTeamId` import field is not used by the frontend.

The interface uses a pixel basketball scoreboard theme: Pixelify Sans for headings, IBM Plex Sans with tabular numerals for scores and data, and a shared palette in `app/globals.css`. Dropdowns use Radix Select for keyboard, focus, and popup behavior, with our own pixel styling. There is no animation runtime.

- `components/ui/`: shared buttons, panels, segmented controls, dropdowns, search fields, toolbars, result counts, page headings, notices, and pixel SVG icons. `controls.css` owns the common field/menu styling.
- `components/league/`: navigation, avatars, matchup board, player tables and details, standings, rankings, news, filters, and connection status.
- `components/dashboard.tsx`: navigation and filter state, composing the view components.
- `components/league/format.ts`: numeric formatting and deterministic player sorting.

Use `Select` for new dropdowns and `TeamSelect` for team filters (including team logos). Player filtering lives in `PlayerFilters`; the team and trade views reuse the same dropdowns, avatars, and controls. Keep new control styles in the shared components instead of adding page-specific native inputs.

One shared, expandable power explanation appears on the active power/trade view; missing-data explanations stay on the relevant player. Wide tables scroll independently. Matchup categories use full-width stacked rows, with the home value left, category centered, and away value right on desktop and mobile.

## Structure

- `app/`, `components/`: responsive dashboard and server-rendered entry point.
- `lib/`: validated public snapshot contract, server-only storage reader, and pure team/trade/news analysis.
- `worker/`: ESPN reads, normalization, rankings, news, transactional sync.
- `db/schema.sql`: snapshots, sync history, and persistent trade votes. Optional worker retention bounds snapshots/logs; raw payloads remain server-side.
- `docs/`: setup, methodology, implementation milestones.

ESPN is an unofficial upstream interface with no guaranteed availability. Endpoint and stat mappings follow the community [espn-api](https://github.com/cwendt94/espn-api) project. The adapter uses direct HTTP to retain original payloads and enforce timeouts and coverage checks. News feeds provide limited headline coverage, not a complete article archive.

### Trade history and anonymous battles

The **Trades** tab contains Calculator, Battles, and History. The worker imports completed current-season trades from ESPN's read-only `communication/?view=kona_league_communication` endpoint, filtering activity type `244` and paging through all results. Each battle compares one team's side of a trade against a side of a different trade. History displays the players sent and received; incidental drops are not trade assets. Import failures preserve the previous history and show a refresh warning.

Voting requires no account and intentionally allows repeat votes. One shared Elo ranking starts at 1,000, with K=32. Visitors choose which team made the better deal; winning votes raises MMR and losing votes lowers it. Higher-rated deals sit at the top and lower-rated deals at the bottom. The rankings reflect visitor opinions with hindsight, not calculated player power. Unvoted entries have no rank, and equal rounded MMR shares a rank. Vote counts count appearances in battles, including losses.

`GET /api/trade-battles` returns ratings. `POST /api/trade-battles` validates both entries against the current league snapshot, then atomically records the vote and updates both ratings. A UUID request ID prevents a network retry from recording the same submission twice; a fresh vote always has a new ID. No voter identifier, login, or IP address is stored by this feature.

Player names in Battles, History, and expanded trade rankings offer a shared hover/focus/tap stat preview. These are current season per-game stats, not historical trade-date values. Rankings requests time out after 15 seconds so a stalled request cannot permanently block refreshes. Database pools handle idle disconnects without crashing the process, and a failed optional sync-status lookup preserves the validated league snapshot with a status warning.

Local development persists votes in ignored `data/trade-battles.sqlite` (override with `BATTLE_DB_PATH`). When `DATABASE_URL` is configured, the web app uses PostgreSQL and creates the two battle tables if missing; they are also included in `db/schema.sql`. PostgreSQL advisory locks serialize concurrent votes across web instances. Production voting requires PostgreSQL or an explicit `BATTLE_DB_PATH` on a persistent volume; ephemeral container storage is not enabled by default. Back up the vote database separately from ESPN snapshots. Local SQLite votes are not automatically migrated to hosted PostgreSQL. Demo, live, league, and season ratings remain isolated.

### Weekly highlights and motion

League awards use this week’s scored team totals and preserve tied winners. Matchup MVP uses actual scored player totals from ESPN’s `rosterForMatchupPeriod` (actual weekly split 5). Each side’s player counts must reconcile with all eleven team counting/shooting-volume totals before MVP scoring is enabled; season per-game power is not used. The nine category z-scores use all scored league participants with games played, invert turnovers, and weight shooting by attempts. Each side’s top contributor is shown, with the matchup’s top value crowned; tied values share the honor. Current-week results are labeled “So far.”

Motion components animate score changes, leaderboard movement, award trophies entering view, successful trade votes, category lead changes, and newly final matchups. Final state follows ESPN’s winner field rather than the local clock. Reduced-motion settings disable motion; initial renders do not pretend that a score or winner just changed.

### Forecast and Records

Two shared main tabs sit after Trades. Forecast defaults to next week, with a rest-of-week option, scheduled opponents, legal daily lineups, and projected nine-category totals. Its expandable assumptions show excluded players and selected player-games. Head-to-head lives in Records; What If lives beside the projection views in Forecast. Head-to-head compares any two teams’ scored totals for a chosen week, shows their finalized head-to-head results and closest meetings, and links their trades. The What If view plays each measured team against every other team in the same week, using selectable categories. Each matchup contributes one win/loss/tie; ranking uses wins plus half a tie, with shared ranks. Turnovers are inverted and percentages use ESPN’s team totals. This is a replay of scored stats, not a forecast or lineup simulation.

The worker reads only this season’s past periods in bounded batches via `mMatchupScore`/`mScoreboard`. Only ESPN-finalized matchups enter history. Failed optional history imports preserve the same league/season’s prior results without stopping the current sync. The head-to-head week selector adds completed weeks as they become available.

`lib/result-corrections.ts` preserves the owner's six confirmed Week 1 outcomes for live league 1834203755, season 2027. The server overlays them after validating each snapshot, so refreshes, syncs, and redeploys cannot erase them. Standings receive only the difference from any already-finalized imported result; if ESPN restores those results, they are not counted twice. Head-to-head history and winning streaks use the corrected history. Unknown category scores and player performances remain missing, so these outcome-only corrections do not create statistical records or What If results. Raw ESPN snapshots remain unchanged. Later weeks continue to use ESPN records.

Records has a current-week preview and a finalized season cabinet. Counting records use weekly totals; the lowest FG% record requires at least 50 attempts. Biggest/closest wins use the category margin, ties share records, and ties/losses end winning streaks. The new-record flag requires a strict improvement over an earlier week; its animation plays only on an observed update. No previous seasons, accounts, or new database writes are required.


### Live League page

The hosted sync service runs `python -m worker.live` continuously (no Railway cron). Full roster, power, news, and history imports run five minutes after the preceding full import finishes. During active NBA games, a lightweight ESPN matchup request refreshes category scores roughly every 30 seconds. `league_live_scores` stores one replaceable row per league/season instead of growing snapshot history at this cadence. The web reader accepts only newer, complete, matching-period scoreboards and falls back to the full snapshot on failures. ESPN latency still applies. Public NBA scoreboard checks continue once a minute while idle, with a five-hour post-tip window for score corrections. The score timestamp is separate from the full import timestamp.

League shows today's NBA games, fantasy matchups, today's rostered non-IR player performances, and roster news. Standings, cumulative weekly awards, and completed records live under Records. Daily performance uses actual box scores scored against the same season reference pool as power, including volume-weighted shooting and inverted turnovers. Surprises/letdowns compare that score to the player's season per-game baseline from the latest import (which may include a completed game); they are descriptive, not forecasts or a change in season power. Unknown baselines are excluded from surprises/letdowns. Negative lists require a final game and at least 10 minutes; DNPs and unfinished games are never called underperformers. Partial box-score coverage is labeled; missing data is never treated as zero.

### Transaction ledger

Records → Ledger lists completed adds, waiver pickups, drops, and trades from this season, newest first. Team/type/player filters keep each transaction together, including both directions of trades. Player previews show current season stats. Forecast → What if retains the weekly all-play comparison and category toggles.

The full worker sync imports the read-only ESPN activity feed (codes 178/180 add, 179/181/239 drop, 244 completed trade). Pagination is validated; lineup moves and trade proposals are excluded. Code 239 identifies the dropping team through `for`, while 179/181 use `to`. A failed fetch preserves the previous ledger for the same league and season. `transactions`, `activitySyncedAt`, and `activitySyncError` are stored in the existing snapshot JSON; no database migration or ESPN write is required.
