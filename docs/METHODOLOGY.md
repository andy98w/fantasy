# Observed rankings and balanced outlook

Power measures observed season-per-game roster value. Trades default to a separate balanced outlook; forecasts apply that outlook to schedules, legal lineups and explicit availability scenarios.

## Player value

The comparison pool is the top N players by minutes per game among players with at least three games and complete PTS, REB, AST, STL, BLK, 3PM, TO, FGM, FGA, FTM, FTA. N is league team count × non-IR roster slots + 24, capped by eligible coverage. The pool IDs and model version are saved with the snapshot. UI filters and trade scenarios never recompute the pool.

Counting-category contribution is `(value − pool mean) / pool standard deviation`. Turnovers use the opposite sign. A category with zero variance contributes zero.

The percentage baseline is the pool's total per-game makes divided by total per-game attempts. Player shooting impact is `makes − baseline × attempts`. The impact is standardized like other categories. Zero attempts produce zero impact; missing attempts make a player ineligible. Displayed player percentages are recomputed from makes and attempts.

Category contributions are persisted to three decimals. Their sum, also rounded to three decimals, is `zTotal`. Display `power` as the empirical midrank percentile of that total within the reference pool (0–100); it is not a win probability. Player and team ranks use competition ranking: equal underlying scores share ranks (1, 2, 2, 4). IDs stabilize row order within a tie but do not break the tie. Display rounding can make different underlying scores look identical.

## Standings

The League table ranks by `(wins + 0.5 × ties) / completed games`, with zero before any completed games. Equal percentages share competition ranks. For this league, the record counts weekly matchups. ESPN's imported playoff seed is preserved and separately labeled on the team profile; the record table does not pretend to reproduce ESPN tiebreakers.

## Team power estimates

Team power sums `4 * asinh(category_z_total / 4)` across the nine categories of the entire roster, including bench and IR. Injuries do not discount per-game value, and moving a player between bench and IR does not change power. An unrated player is assigned reference-average value (zero z-score in each category) **only for the provisional team estimate**; the player remains unrated. A team with no rated players has no score or rank. Teams with partial coverage participate in the ranking and are visibly marked provisional. Coverage counts and missing-player names are available in the team view. Coverage is not a confidence probability.

This neutral imputation avoids silently dropping ten teams from the league leaderboard, but it can overvalue or undervalue unknown players. It is particularly uncertain for injured stars or very small samples. Scores can be negative; zero means a reference-average roster contribution, not zero production. Roster size affects the sum. This is a descriptive roster-value model, not schedule-adjusted competitive strength.

## Balanced outlook v1

`lib/outlook.ts` is shared by the UI and MCP. It blends current-season production with complete actual stats from the immediately previous season, keeping observed Power, actual daily/weekly stats and historical results unchanged. Trade valuation defaults to this outlook; “Season so far” / MCP `basis: current` remains available.

For counting rates, current weight is `current GP / (current GP + min(previous GP, prior cap))`. The prior cap is 10 games for normal counting stats and 20 for steals/blocks. When both seasons have positive minutes, blend per-minute production, then multiply by **current minutes per game**. Without minutes, blend per-game rates and flag the limitation. Material minutes changes (at least five minutes or 20% of prior minutes) prompt role review. This uses observed current minutes, not a news-derived future role forecast.

Shooting accuracy pools current makes/attempts with historical pseudo-attempts: at most 400 FG attempts or 250 FT attempts, further capped at actual prior attempts. Projected makes are projected attempt volume × blended accuracy. Three-point makes are a blended rate capped at projected field-goal makes; no separate three-point-attempt model is imported. Points are derived as `2 × FGM + 3PM + FTM`. Zero attempt totals have unknown percentages, not invented accuracy.

Zero current games use the previous season only. No usable prior means current-only production with a warning, including rookies. Incomplete played-season data stays unavailable; missing values never become zero production. Sources, sample sizes, per-category current weights and warnings are exposed as `outlook` / `outlookEstimates` and collapsed UI inputs. Counts’ weights apply to per-minute rates when available; PTS has no independent weight.

Outlook z-scores use the same snapshot reference-pool IDs, with means/variances computed from their outlook stats. That one pool is fixed across both teams and all swaps. TO is inverted; FG/FT use volume-adjusted impact. Full-roster category totals use the existing taper and each team's independent weights. Missing outlooks retain provisional coverage. Outlook scores do not replace observed Power percentiles or claim calibrated probabilities.

Parameters were selected on 30 historical veteran players and evaluated on 13 held-out players, predicting the next ten played games from early-season prefixes. See [validation](OUTLOOK_VALIDATION.md) and [machine-readable results](outlook-validation.json). This is limited one-season evidence with survivor/roster-selection bias, not validated rookie, injury-return, full-season or weekly-win modeling.

## Trade calculator

The calculator swaps the selected players in memory without mutating imported rosters or issuing ESPN writes. Each side keeps independent category weights: Punt = 0, Normal = 1, Priority = 2. Before/after category heatmaps show unweighted contributions; fit scores apply the team's weights after tapering each category total. A positive turnover contribution means lower turnovers. Shooting rows show standardized volume-weighted impact, not pooled team FG% or FT%.

Outgoing player value is unweighted. Unknown player values remain visible as unrated and use the same reference-average assumption in provisional roster totals. Comparisons with no measured data on either side of the before/after calculation remain unavailable. All-punted preferences show no fit evaluation.

Player ownership, distinct teams, and duplicate selections are validated. If a background import invalidates selected player ownership, the comparison stops and asks for a reset. Draft selections survive tab navigation during the current page session; reloading starts a fresh draft. Total roster-slot overages are flagged, but positional/IR eligibility and ESPN trade rules are not validated. Empty slots and required drops are not optimized. The UI provides category gains/losses rather than a single trade-winner claim. Both UI and MCP show next-week production before/after in conservative and if-available scenarios, separate from roster value. Incoming IR placement is retained as an explicit production assumption, not verified destination eligibility. Missing schedules, missing stats or activation capacity prevent a complete production estimate.

## News

League news includes headlines matched to rostered players; team news matches that team's roster. Within each UTC publication day, injury/availability/role headlines are prioritized, then publication time. Unlinked general NBA headlines are excluded from these feeds. Matching remains conservative (full player names), so coverage is incomplete.

## Weekly forecast

The Forecast tab uses current roster balanced outlooks and the imported NBA schedule. For each date, a maximum-weight legal assignment fills as many starting slots as possible, then maximizes summed outlook z-scores. Conservative availability excludes IR and every non-ACTIVE status, including day-to-day and unknown. The optional `if_available` scenario assumes uncertain players play and OUT, suspended and IR players become available after today. Today’s OUT/IR exclusions and started lineup locks are preserved. IR activation consumes non-IR roster capacity for the rest of the window; if capacity is insufficient the scenario is withheld and reports the number of slots to free. No drops are assumed. These are conditional scenarios, not return-date predictions or probabilistic bounds: ESPN supplies current status, not a confirmed future absence or return date. Per-player assumptions, per-date exclusions and the status snapshot timestamp accompany the result. A zero-game player can use complete actual averages from the immediately previous season, explicitly labeled with season and games played. Subsequent current games gradually enter the blend; one game no longer discards the history. Missing or invalid baselines still prevent a complete forecast and identify the player by name; never insert zero production. This fallback does not alter actual stats, power, or historical results. Hypothetical roster exclusions let users explicitly free non-IR capacity; they never mutate ESPN and cannot unlock today’s started lineups.

Counting totals are averages × selected games. Shooting percentages divide total makes by total attempts, including current actual makes/attempts for rest-of-week forecasts. Rest-of-week adds only future production to actual matchup totals; already-started players retain their lineup slot. Live-game remainder uses the fraction of regulation time remaining (or the current overtime period). Final games add no projected production. Scores must be under 15 minutes old; started-game statuses must be under 90 seconds old. This approximation does not model rotations, blowouts, or independent feed delays.

Projections compare their displayed precision (one decimal for counts, one decimal percentage point for shooting). Close categories are within 5% for counts or 1.5 percentage points for shooting; these labels are not confidence intervals. Category wins are a deterministic forecast, not win probabilities. Player power remains the separate descriptive roster-value metric.

Schedule support currently covers regular Monday–Sunday, single-week matchup periods with daily individual-game lineup locks, at most 12 active slots, and no game/stat caps. The opening week starts on NBA opening night. Current daily scoring period must agree with the inferred calendar; unsupported or inconsistent schedules disable Forecast without breaking the rest of the import. Multi-week playoffs and special calendars need explicit period-date metadata before support is added.

Backtest historical forecasts before introducing win probabilities. Player-specific injury return estimates and game-to-game variance remain future work. The limited per-game outlook backtest does not validate win probabilities.


## Daily performers and historical cutoff

Daily production remains the sum of nine category z-scores against the current season reference pool, with shooting weighted by attempts and turnovers inverted. Top performers rank actual production; Surprises and Letdowns compare actual production with the player's own current-season average (3+ games). Previous-season forecast estimates are never used for daily comparisons.

Shitters requires a finished game, 10+ minutes, and a score strictly below both zero and the empirical 10th-percentile cutoff. Up to six qualify, with no minimum list size. The worker collects final regular-season ESPN box scores over a rolling 28-day window ending two Pacific days before the import. This excludes today and the previous-day recap. Samples include only 10+ minute appearances by current reference-pool players, with at least 300 player-games across seven dates. The percentile uses linear interpolation at `(n - 1) × 0.1`; every fresh league import rescores cached games against the same current reference pool used by the UI and MCP. The first November 2 calibration contained 1,120 performances in 88 games (Oct 20–31), cutoff approximately −6.924. This is a product cutoff, not a validated prediction of matchup losses.

A bounded four-request worker pool fetches history once daily, reuses old final boxes, and refreshes recent boxes for corrections. Incomplete fetches are rejected; failure does not block the main league import. Missing, insufficient, overlapping or stale calibration withholds Shitters with an explanation; other performer modes continue. Calibration dates, sample size and cutoff are exposed in MCP and the UI methodology. Cards display the two largest negative contributions, grouping zero steals/blocks as “0 stocks”; Letdowns reasons use declines from that player's average. No player-specific exceptions or repeat suppression.
