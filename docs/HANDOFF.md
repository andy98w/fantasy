# Fantasy — handoff

Updated November 6, 2026 (Pacific/Honolulu). This is the starting point for a new chat; verify the working tree and live state before making changes.

## Start here

- Repository: https://github.com/andy98w/fantasy
- Local checkout: `/Users/andywu/Documents/Codex/2026-10-29/new-x20/outputs/fantasy`
- Live website: https://web-production-8d109.up.railway.app/
- Local website: http://127.0.0.1:3000
- Hosted MCP: https://web-production-8d109.up.railway.app/mcp
- League: `1834203755`, season `2027` (2026–27), name Monke, 12 teams, H2H most categories.
- Current follow-up: preserve dated forecast lineups separately from current ownership after adds, drops and trades. Use `git log -1` and exact-commit CI/deployment checks for release state.
- Previous application release: `006a4de5122e834e472dbd69d43713de6b4ea7ec` — bounded team Power /9.
- That previous application commit passed all four CI jobs and deployed successfully. GitHub Actions run: `41746722680`; Railway GitHub deployment: `7534356861`.
- Application working tree was clean before writing this handoff. No unfinished application changes remain.

Read `AGENTS.md` first. It requires reading the relevant bundled Next.js documentation under `node_modules/next/dist/docs/` before code changes. Do not assume familiar Next.js APIs match this installed version.

Some README and deployment-guide paragraphs predate the live release: references to six navigation tabs, Trades → History, Matchup MVP, Rivalries, and “not yet deployed” are stale. Prefer this handoff and current implementation for those details; setup and operational sections are still useful.

## Copy restraint

November 8: removed the daily Shitters “How this list works” disclosure and its qualifying-game / historical-cutoff text at the user’s request. Ranking logic, calibration and missing-data messages remain unchanged.

Removed the always-visible Team power explanation (methodology remains in How power works), redundant dropdown menu titles, Forecast assumptions subtitle and per-team Projected labels. The default forecast explanation lives in the expandable methodology; conditional-return mode still shows a short reminder that returns are assumed. MCP access copy is shorter. Keep dates, units, missing/stale-data warnings and meaningful scenario limitations.

## Scrollbar presentation

Native scrollbars are hidden globally with `scrollbar-width: none` and a WebKit scrollbar fallback. Scroll containers retain their existing overflow and keyboard behavior, including tables, menus, dialogs and the document. Dropdown scroll arrows remain usable controls.

## Shared supporting-detail presentation

The shared `components/ui/disclosure.tsx` / `disclosure.css` now styles all explanatory disclosures: power help, daily performer methodology, forecast roster exclusions, player outlooks, trade valuation/edges/production, stat corrections and MCP help. Native keyboard behavior remains intact. Structured matchup and battle summaries retain their purpose-built layouts and visible focus states. Power/valuation/daily explanations use short titled groups; correction totals and trade availability use aligned facts instead of long lists in prose.

All `Select` menus share a compact field-name header, selected-row accent and visible keyboard/open states. Shared panel notes, footnotes and history warnings have consistent spacing and muted framing. No scoring or forecasting calculations changed. Local browser checks covered 390px mobile layout, long/grouped dropdowns, keyboard last-option selection, and nested trade outlook tables. Typecheck, build, 159 tests and standalone smoke passed. The existing correction provenance test now checks the FG value in its labeled fact row.

## Latest forecast presentation update

Forecast assumptions now contains matching teal/pink team panels, compact status rows, exclusions grouped by player and reason with deduplicated dates, and aligned playable-game lists. Player outlook inputs and methodology remain expandable. Missing stats, IR activation space, hypothetical exclusions and projection issues are preserved; projection calculations are unchanged. Implementation: `components/league/forecast-details.tsx` and scoped `forecast.css` styles.

Validated with typecheck, production build, 159 tests and standalone smoke. Browser checks covered desktop and 390px mobile, nested disclosures, conditional availability and required IR roster space. Local visual checks used a disposable schedule fixture under the chat's `work/` directory; it is not production data or committed. Verify the exact release commit's CI and Railway deployment before claiming it is live.

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
| League | Current fantasy matchups; daily performers; roster news; Today games and available players. Matchup player tables have a Week / Today toggle: Week uses credited lineup totals; Today uses current-roster NBA box scores (including bench/IR), only Pacific-date games, minutes and game status/clock. Missing stats stay blank; before the first actual NBA start today, show the previous played slate from performerDay, labeled Yesterday/date or Last game day. Switch globally at the first started game, even if neither fantasy team has a player in it. In progress means the NBA game is live, not on-court presence; stale feeds say Last seen live. Clicking games opens NBA box scores. Clicking players opens profiles/game history. |
| Teams | Team power, sortable category heatmap, rosters and news. IR contributes to full-roster power; availability affects production forecasts separately. No “Rated players” column. |
| Players | Search/filter/sort player stats, power and seven-day risers/fallers when comparable history exists. Player and team roster tables always show a sortable Status column beside the player name, independent of fantasy-team ownership. Weekly matchup players and NBA box scores also show sortable Current status columns from the latest snapshot (Unknown when absent), separate from historical DNP/participation; trade player lists show current-status badges. |
| Trades | Calculator, Battles (default), Auction House. History was replaced; completed transactions are in Records → Ledger. |
| Forecast | Next-week/rest-of-week schedule-aware projections and What if (weekly all-play replay, not a forecast). |
| Records | Matchups default: week selector, all imported matchups/results, expandable category totals, scheduled future pairings. Also standings, current-week awards and transaction ledger. Head-to-head was removed; all-play comparisons remain in Forecast → What if. |
| MCP | ChatGPT / Claude / Other setup instructions; hosted URL; fantasy-team selector and copyable starter prompt. |

Daily performer tabs: Top performers, Shitters, Surprises, Letdowns; up to six cards ranked #1–#6. Top/worst measure actual daily contribution; surprises/letdowns compare against the season per-game baseline. Negative lists require a final game and at least 10 minutes. Before today's first actual tip-off, retain the latest played day's performers and show its date. Today sidebar remains on today's schedule. Do not fabricate rows when fewer players qualify.

Matchup player tables default to the daily view (Today, or Yesterday/Last game day before today starts). During a recap, lineup groups and bench/IR labels explicitly refer to current slots, not historical scoring eligibility. Today tables group current roster slots into Active lineup, Bench / IR (not in scoring lineup), and unknown slots when needed. Sorting stays within each group; bench/IR NBA stats remain visible for reference. Injury status does not determine lineup membership. Week stays ungrouped because a currently benched player can have earned counting stats earlier in the week.

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
- Team power: 0–9 average category leads against other rated league rosters; each lead=1, tie=0.5, loss=0. Full roster includes IR and bench. Trade fit applies independent category weights to these edges and normalizes to 0–9. See league-categories-v1 below.
- Heatmaps show raw category z-totals, separate from bounded team Power. Positive TO category strength is good (fewer turnovers); raw turnover stats still mean lower is better.
- Unrated rostered players contribute reference-average zero to the estimate, with provisional/coverage metadata retained. Fully unrated rosters stay unranked. Zero assumed value does not mean zero production.
- Forecasts use balanced outlooks, actual schedule, legal lineup slots and explicit conservative/if_available scenarios. Conservative excludes all non-ACTIVE statuses and IR. If available assumes uncertain players play and OUT/suspended/IR return after today; activation requires non-IR roster capacity. Scenarios are not return-date predictions. They are estimates, not win probabilities. Trade simulations do not execute trades or prove ESPN roster legality.
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

## Week 2 missing Monday totals

User supplied Broke Young Boys (team 8) missing Monday, October 26 totals after the league reset. `lib/result-corrections.ts` adds **10/25 FG, 4/4 FT, 1 3PM, 15 REB, 3 AST, 3 STL, 1 BLK, 7 TO, 25 PTS** only to Week 2 matchup 7 (team 8 home vs team 7 away), for live league 1834203755 / season 2027. The overlay runs after the live-score merge, covers both current and historical matchups, recomputes shooting percentages/category scores, and adjusts completed standings only by the result difference. `statCorrections` provenance survives schema parsing and prevents repeat application. Original imports and player stats stay intact; player attribution is incomplete because only team totals were supplied. Missing base totals stay unknown. If ESPN later restores Monday upstream, verify that recovery and retire this additive correction; cumulative totals cannot detect it automatically.

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

## November 2 forecast and daily-performer update

Zero-game forecasts use labeled immediately previous-season actuals from `player.previousSeason`; these never change actual stats or power. Missing baselines name the players. Numeric ESPN slot 13 is correctly excluded from non-IR capacity; the Forecast UI and MCP support explicit hypothetical roster exclusions to make room for returns, preserving today's locks.

`worker/daily_calibration.py` builds a rolling historical 10th-percentile cutoff (28 days ending today minus 2, regular-season final games, 10+ minutes, current reference-pool players, minimum 300 samples/seven dates). Raw game samples are bounded in `data/daily-calibration-cache.json`, not duplicated in database snapshots or sent to clients. Snapshot `dailyCalibration` contains only derived metadata. Missing calibration hides only Shitters, never fabricates a threshold. UI and MCP expose scoring reasons; Letdowns remains personal-baseline-relative. See METHODOLOGY for cutoff details. Verify this commit's CI and deployed worker import before claiming these changes are live.

## Player injury / return outlook

Clicking a player opens a profile with an injury / return outlook above the stats. `lib/player-injury.ts` reads ESPN's public NBA injury feed on demand through `/api/players/[id]/injury?season=2027`; the shared feed cache refreshes after five minutes and coalesces requests. Player identity comes from canonical ESPN athlete links, not injury IDs. Shows a compact status/body-part line, estimated return, short report and dated source link. The source report preserves reevaluation wording without added explanatory paragraphs; dates in the past are labeled as past estimates. Unknown dates stay unknown, failed requests offer Retry, and saved data is flagged and expires after 24 hours. Current-season feed only; no demo fetches. This display does not alter forecast availability or roster status.


## November 3 balanced outlook

`lib/outlook.ts` adds balanced-v1, leaving actual stats/results and observed Power untouched. Trades default to Balanced outlook, with Season so far as a comparison. Forecasts use the same estimate. Current/prior/estimated stats and weights are collapsed under Outlook inputs. MCP 1.3.0 adds per-player outlooks, independent left/right trade preferences and observed comparisons. No-history/rookie players stay current-only and explicitly flagged; injured-player availability scenarios are unchanged.

Historical tuning selected counting-rate prior caps of 10 games (20 steals/blocks), current minutes with no shrinkage, 400 FG and 250 FT prior-attempt caps. All are capped by actual historical coverage. Evaluation: 30 training / 13 held-out veterans, 2024–25 prior and 2025–26 target logs, next-ten-game averages at 1/3/5/10/15/25 games. Limited evidence with selection bias; do not claim calibrated probabilities or reliable injury-return/rookie predictions. Read `docs/OUTLOOK_VALIDATION.md`, `docs/outlook-validation.json` and `scripts/backtest-outlook.ts`. Verify exact-commit CI and Railway before reporting release state.


## November 3 bounded team Power

`leagueRating` (`lib/analysis.ts`) replaces the unbounded taper in team rankings, profiles, trade fit and MCP. Power /9 is the average number of raw roster category strengths leading other rated teams; ties count half. More extreme margins have no further influence after all peers are passed. Raw columns remain unchanged. Trade fit uses the same rule on balanced or observed inputs with each side's own normalized weights, updating both traded rosters together. MCP 1.4.0 exposes `categoryEdges`, opponent comparisons/coverage and `fitModel` (`league-categories-v1`). Missing coverage propagates provisional flags; no rated peers means no score. History recomputes each saved league with its own historical opponents, never today's roster.

This is a descriptive all-play comparison of roster strengths, not actual weekly wins or a calibrated probability. Small changes near peer boundaries can change the score; raw values remain available. The previous outlook calibration is unrelated to validation of this aggregation. Legacy taper helpers remain only for offline comparison. Use exact-commit CI/deployment verification for release status.


## November 5 player comparison pins

Players has a pin toggle beside every name, supports multiple pins, and a Clear pins control. Pinned rows stay above search results even when excluded by search, position or availability filters; each player appears only once. Current sorting applies within pinned and unpinned groups. Pin IDs live in Dashboard React state: survive navigation between tabs and automatic data refresh, reset on a full page reload. Player stats are resolved from the latest snapshot, never copied into pin state. Other player tables are unchanged.

Validation: 159 web tests, typecheck, build and standalone smoke passed. Browser checks covered multiple pins, sorting, search/position filters, empty results, individual unpin, Clear pins, tab navigation and full-reload reset. Verify exact-commit CI and deployment before claiming release success.


## November 5 NBA team filter

Players has a separate All NBA teams dropdown (full NBA franchise names), independent of fantasy ownership/roster and position filters. Options come from all snapshot players, with NBA abbreviation aliases normalized consistently for options and matching. Clear filters resets NBA team too; pinned comparison rows remain visible across team changes. The existing roster dropdown group is explicitly labeled Fantasy teams. Browser checks covered Celtics, Knicks, combined name/position filtering, and clearing while retaining a pin. Local typecheck, 159 tests, build and standalone smoke passed.


## November 6 forecast ownership / locked lineup fix

`forecastSchedule.lineups` preserves each team’s dated mRoster entries separately from current player-pool ownership. Rest-of-week forecasts use that dated membership/slot for started games, including dropped or traded players, and current ownership for unstarted/future games. A new pickup absent from the dated lineup cannot receive already-started production. Bench/IR and locked-slot limits remain enforced. Older snapshots remain compatible; truly unknown slots name the affected player. UI and MCP share `projectTeam`; actual matchup totals are unchanged.

Live replay reproduced Broke Young Boys’ blank forecast after adding Brayden Burries and dropping Ryan Rollins: Burries had current ownership but no dated slot, while Rollins remained on today’s bench. Updated import/forecast restored the projection and counted only Burries’ future game. Tests cover pickup, dropped starter, trade without duplicate live production, final locks, pre-tip ownership, bench/IR and missing-slot handling. Local validation: 164 app tests, 77 worker tests, typecheck, build and standalone smoke passed. Both web and sync worker must deploy, and a new import must contain lineups; verify exact-commit CI/deployment and live forecast before reporting success.


## November 8 sticky Players header

The main Players table keeps its sortable column header at the viewport top while the page scrolls through its rows. `usePageTableHeader` translates the original thead within the table bounds because the horizontal overflow container prevents viewport CSS sticky positioning. The original header preserves sorting, column widths, semantics and the sticky identity column; no cloned header or extra vertical scroll area. Scroll work is animation-frame batched, resizes/filters are observed, and listeners are cleaned up on unmount. This initially applied only to Players; the shared-table update below extends it. Browser checks covered desktop scrolling, sorting while pinned, mobile horizontal alignment, viewport resizing and filtering down to one row. Typecheck, existing tests, build and production smoke passed; verify exact-commit CI and deployment for release state.


## November 8 refreshable page selections

Dashboard links now encode the selected matchup (`#matchup?id=…&week=…`) or team (`#team?id=…`). The shared route parser restores selections on initial hydration, hash changes and snapshot refresh; Back/Forward and copied links work. Plain tab links and old aliases remain supported. Expired/invalid matchup IDs or weeks fall back to League instead of silently selecting a different game. Plain `#matchup` retains the default first-game behavior. Player filters/pins and component subtabs remain session UI state. Verified reload of a non-default matchup and team, plus Back/Forward; 167 tests, typecheck, build and standalone smoke passed. Check exact-commit CI and deployment before reporting live status.


## November 8 sticky headers across tables

All dashboard tables now render through `components/ui/sticky-table.tsx`: players/rosters, matchup categories and player rows, standings/power, What if, trade rankings/impacts/outlook inputs, recent games and NBA box scores. The real sortable header stays inside its own table bounds, leaving as that table ends so subsequent headers take over. The shared hook detects vertical scrolling ancestors and accounts for explicitly marked sticky dialog title bars; horizontal wrappers, nested disclosures, resizing and cleanup remain supported. This refers to column headers; existing frozen identity columns are preserved. Browser checks verified the category-to-player table transition, player-dialog scrolling below the close bar and sorting while pinned. Typecheck, 167 tests, build and standalone smoke passed. Verify exact-commit CI and hosted UI before reporting deployment.

## November 8 current game in player profiles

Player profiles receive the shared Today scoreboard/box-score data. `playerGameHistory` keeps today's started game above the sortable/searchable historical rows, with the live clock and available stats. It renders before the historical request completes, updates through the existing dashboard polling, leaves unknown stats blank and never assigns a W/L before final. Today's final game bridges game-log lag; the completed log takes precedence once present (including corrections), with game-ID deduplication. Scheduled games and the prior performer slate are excluded. A final game without any evidence of player participation is not invented. Stale scoreboard data is labeled Last seen. Browser checks covered a live Paul George game above completed games and preservation through sorting/search. Typecheck, 171 tests, production build and standalone smoke passed. Verify exact-commit CI and Railway before claiming live release.

## November 8 navigation / auto-refresh race

Reproduced on production: open `#players`, click Forecast, then the next 15-second refresh restores both URL and content to Players. Assigning `location.hash` bypassed Next's canonical route; `router.refresh()` restored its old URL, which the dashboard then read. Dashboard navigation now uses Next-integrated `history.pushState(null, '', hash)` and prevents default anchor navigation for ordinary clicks, preserving modifier/new-tab behavior. Popstate restores dashboard selections; external native hash changes synchronize via replaceState. Skip to content focuses the main region without replacing the page route. Initial server/hydration output shows a neutral loading shell until the hash resolves, avoiding a brief incorrect League page. Auto-refresh remains enabled. Browser validation covered the original reproduction through refresh cycles, Back/Forward and selected matchup reload. Typecheck, 172 tests, production build and standalone smoke passed. Verify exact-commit CI and deployment before reporting release.


## November 9 shot charts and player Analysis

NBA box-score dialogs end with an interactive court, made/missed markers, team/player/quarter/result filters, selectable shot details and a Play/Pause game-clock slider. The new `#analysis` tab has player search/selection, latest or specific game and all-season views, official stats, FG/3PT/eFG and shooting zones. Season charts load verified game-log IDs on demand, three requests at a time, with progress and missing-game coverage; requests abort on selection changes. Single live games poll every 30 seconds while visible. Desktop and mobile use the same responsive court; no additional chart dependency.

`lib/shots.ts` normalizes ESPN summary play-by-play. It validates shooter/team identity, quarter and fractional clock, deduplicates play IDs and excludes free throws. Coordinates are feet relative to basket (25, 0), with baseline y=-5.25; missing/sentinel coordinates stay unplotted. The chart shows one normalized attacking basket, including extended court space for long attempts. Missing feeds, malformed plays and mismatched official FGA coverage remain visible instead of inventing locations.

Explicitly tagged missed heaves in the last three seconds of Q1–Q3 at 36+ feet are excluded from player percentages only when removing those attempts exactly reconciles the official player FGA. They remain visible and labeled. This handles the NBA's team-attempt heave rule while leaving other discrepancies flagged. Reference: https://api-hub.nba.com/news/nbas-heave-rule-will-allow-deep-end-of-quarter-shots-without-hurting-shooting-percentages . Charts measure available play-by-play, not fantasy lineup contributions.

`/api/games/[id]/shots?player=ID` returns only that player's shots and box-score row when requested, sharing the existing bounded, coalesced box-score loader with the game dialog endpoint via `lib/game-boxscore-data.ts`. Upstream final-game caching is five minutes, live twenty seconds, with labeled stale fallback. Season coverage is limited to available game logs/play-by-play and is loaded progressively; no fabricated historical chart or new database storage.

Validation: 177 web tests (including shot identity, malformed coordinates/clocks, overtime, weighted shooting and heave reconciliation), typecheck, production build and standalone smoke. Browser checks covered game-dialog and Analysis filters, replay/scrubbing, keyboard shot selection, all-season loading, switching players without retaining prior stats, and 390px mobile layout. Verify exact-commit CI and Railway before claiming deployment.


## November 9 Analysis layout and controls

Analysis now uses one searchable player combobox (matching names/team abbreviations, accent-insensitive multiword matching, click or arrow/Enter selection, Escape cancellation and explicit no-results state) beside the game picker and Refresh. Results do not retain a nonmatching previously selected player. The player heading and ten stats are compact above a court-first layout; quarter/result filters sit beside the chart heading. Mobile wraps controls and stats without horizontal page overflow.

Shot replay uses an explicitly styled range track/thumb, focus treatment, Play/Pause button and quarter markers. Court bounds come from the entire report instead of the visible/time-filtered subset, preventing court resizing while scrubbing. Player box-score absence is explicit rather than displaying an empty shooting chart as measured zero attempts. Validation: 177 existing tests, typecheck, production build and standalone smoke; browser checks covered direct Jalen Brunson search, keyboard/mouse selection, no results and Escape, stable court dimensions at start/end, playback, and 390px mobile layout.


## November 12 recap lineup date fix

Yesterday/last-game-day matchup rows now use the retained snapshot whose explicit `forecastSchedule.lineupDate` matches the displayed NBA slate, rather than grouping old stats by today's roster slots. The lookup is league/season scoped, bounded to the Pacific slate date and following day (ESPN can retain its previous scoring period after midnight), cached for one minute, and optional on database errors. Only the dated roster's profiles/entries are sent to the client. Dated membership also preserves traded/dropped players on their original fantasy team. Current injury status and player-profile links remain current.

Slots are only treated as known when the capture is at or after that NBA game's start. Missing/wrong-date/pre-tip captures show Lineup slot unavailable instead of falling back to today's bench or IR. NBA box-score values and earned weekly matchup totals are unchanged. Regression tests cover date/league/season isolation, traded/dropped players, bench/IR changes and unknown historical slots; PostgreSQL integration checks the actual date-bounded query across DST and next-morning captures. Local validation: 179 app tests, typecheck, production build and standalone smoke passed. Verify exact-commit CI and Railway plus the live recap before claiming deployment.
