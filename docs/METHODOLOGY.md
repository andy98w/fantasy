# Rankings and trade comparisons v2

This release measures observed season-per-game player value. It does not project future production, simulate weekly outcomes, or optimize lineups.

## Player value

The comparison pool is the top N players by minutes per game among players with at least three games and complete PTS, REB, AST, STL, BLK, 3PM, TO, FGM, FGA, FTM, FTA. N is league team count × non-IR roster slots + 24, capped by eligible coverage. The pool IDs and model version are saved with the snapshot. UI filters and trade scenarios never recompute the pool.

Counting-category contribution is `(value − pool mean) / pool standard deviation`. Turnovers use the opposite sign. A category with zero variance contributes zero.

The percentage baseline is the pool's total per-game makes divided by total per-game attempts. Player shooting impact is `makes − baseline × attempts`. The impact is standardized like other categories. Zero attempts produce zero impact; missing attempts make a player ineligible. Displayed player percentages are recomputed from makes and attempts.

Category contributions are persisted to three decimals. Their sum, also rounded to three decimals, is `zTotal`. Display `power` as the empirical midrank percentile of that total within the reference pool (0–100); it is not a win probability. Player and team ranks use competition ranking: equal underlying scores share ranks (1, 2, 2, 4). IDs stabilize row order within a tie but do not break the tie. Display rounding can make different underlying scores look identical.

## Standings

The League table ranks by `(wins + 0.5 × ties) / completed games`, with zero before any completed games. Equal percentages share competition ranks. For this league, the record counts weekly matchups. ESPN's imported playoff seed is preserved and separately labeled on the team profile; the record table does not pretend to reproduce ESPN tiebreakers.

## Team power estimates

Team power is the sum of category z-scores across the whole roster, including bench but excluding IR. An unrated player is assigned reference-average value (zero z-score in each category) **only for the provisional team estimate**; the player remains unrated. A team with no rated players has no score or rank. Teams with partial coverage participate in the ranking and are visibly marked provisional. Coverage counts and missing-player names are available in the team view. Coverage is not a confidence probability.

This neutral imputation avoids silently dropping ten teams from the league leaderboard, but it can overvalue or undervalue unknown players. It is particularly uncertain for injured stars or very small samples. Scores can be negative; zero means a reference-average roster contribution, not zero production. Roster size affects the sum. This is a descriptive roster-value model, not schedule-adjusted competitive strength.

## Trade calculator

The calculator swaps the selected players in memory without mutating imported rosters or issuing ESPN writes. Each side keeps independent category weights: Punt = 0, Normal = 1, Priority = 2. Before/after category heatmaps show unweighted contributions; fit scores sum those contributions with the team's weights. A positive turnover contribution means lower turnovers. Shooting rows show standardized volume-weighted impact, not pooled team FG% or FT%.

Outgoing player value is unweighted. Unknown player values remain visible as unrated and use the same reference-average assumption in provisional roster totals. Comparisons with no measured data on either side of the before/after calculation remain unavailable. All-punted preferences show no fit evaluation.

Player ownership, distinct teams, and duplicate selections are validated. If a background import invalidates selected player ownership, the comparison stops and asks for a reset. Draft selections survive tab navigation during the current page session; reloading starts a fresh draft. Total roster-slot overages are flagged, but positional/IR eligibility and ESPN trade rules are not validated. Empty slots and required drops are not optimized. The UI provides category gains/losses rather than a single trade-winner claim.

## News

League news includes headlines matched to rostered players; team news matches that team's roster. Within each UTC publication day, injury/availability/role headlines are prioritized, then publication time. Unlinked general NBA headlines are excluded from these feeds. Matching remains conservative (full player names), so coverage is incomplete.

## Weekly forecast

The Forecast tab uses current roster season per-game averages and the imported NBA schedule. For each date, a maximum-weight legal assignment fills as many starting slots as possible, then maximizes summed player z-scores. Bench players can start on future dates; IR and players marked out/suspended cannot. Day-to-day players are assumed available. Future transactions and return dates are not predicted. A selected player with missing count stats or no games prevents a complete forecast rather than contributing invented zeros.

Counting totals are averages × selected games. Shooting percentages divide total makes by total attempts, including current actual makes/attempts for rest-of-week forecasts. Rest-of-week adds only future production to actual matchup totals; already-started players retain their lineup slot. Live-game remainder uses the fraction of regulation time remaining (or the current overtime period). Final games add no projected production. Scores must be under 15 minutes old; started-game statuses must be under 90 seconds old. This approximation does not model rotations, blowouts, or independent feed delays.

Projections compare their displayed precision (one decimal for counts, one decimal percentage point for shooting). Close categories are within 5% for counts or 1.5 percentage points for shooting; these labels are not confidence intervals. Category wins are a deterministic forecast, not win probabilities. Player power remains the separate descriptive roster-value metric.

Schedule support currently covers regular Monday–Sunday, single-week matchup periods with daily individual-game lineup locks, at most 12 active slots, and no game/stat caps. The opening week starts on NBA opening night. Current daily scoring period must agree with the inferred calendar; unsupported or inconsistent schedules disable Forecast without breaking the rest of the import. Multi-week playoffs and special calendars need explicit period-date metadata before support is added.

Backtest historical forecasts before introducing win probabilities. Prior-season blending, player-specific injury return estimates, and game-to-game variance remain future work.
