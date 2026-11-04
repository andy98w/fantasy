# Balanced outlook v1 validation — November 3, 2026

Limited historical evaluation supports smoothing early-season performance. It does **not** validate weekly win probabilities, season-total production or individual trade decisions.

## Data and separation

Official ESPN individual regular-season game logs, 2024–25 as prior and 2025–26 as target. Sampling began with currently rostered players having at least 40 previous-season games, sorted by ESPN ID, every third player, capped at 48. Forty-three had usable logs with at least 20 prior games and 35 target games. This selects surviving established players and can overstate general applicability.

The sorted sample index modulo three determines the split before evaluating: index 0 modulo three is held out. Thirty training players / 180 prefixes; thirteen held-out players / 78 prefixes. A player's prefixes never cross splits. At 1, 3, 5, 10, 15 and 25 target-season games, predict the next ten played games. Current stats come only from that prefix; previous stats come only from the prior season. Playoffs/preseason/All-Star games are excluded. No target-season final averages enter predictions. Overlapping windows mean the 78 examples are not independent.

Training chooses parameters with two coordinate passes over a fixed grid. Loss averages nine category MSEs, scaled by training target variance; shooting errors are weighted by target attempts. Held-out results are read only after selection. Minutes are evaluated but not included in the nine-category selection loss.

## Selected parameters

- Prior-game cap: 10 for ordinary rates, 20 for steals/blocks.
- Minutes prior cap: 0 (use observed current minutes immediately).
- Prior-attempt caps: 400 FG and 250 FT, both at the upper end of the tested grid.
- All caps are bounded by actual previous-season coverage.

These are small-sample choices, not universal statistical constants. Exact grid, input hash, sample IDs, per-category metrics and checkpoint results are in [outlook-validation.json](outlook-validation.json). Formula implementation is `lib/outlook.ts`; repeat evaluation with `npx tsx scripts/backtest-outlook.ts INPUT.json REPORT.json`. Input is an array of `{id,name,seasons:{2025:payload,2026:payload}}`, where payload comes from ESPN's `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/PLAYER_ID/gamelog?season=SEASON`. Fetches can change after stat corrections; compare the recorded input hash.

## Held-out results

Aggregate normalized MSE: current-only **0.927**, previous-only **0.403**, balanced **0.389**. Most improvement is over tiny current samples; improvement over previous-only is modest. Do not describe the aggregate reduction as a probability or a guarantee for a particular player.

| Per-game mean absolute error | Current only | Balanced |
| --- | ---: | ---: |
| Points | 3.42 | 2.99 |
| Rebounds | 1.14 | 0.93 |
| Assists | 1.20 | 0.78 |
| Steals | 0.43 | 0.30 |
| Blocks | 0.30 | 0.23 |
| Threes | 0.67 | 0.51 |
| Turnovers | 0.82 | 0.50 |
| FG percentage points | 5.8 | 3.4 |
| FT percentage points | 10.9 | 6.3 |
| Minutes | 2.79 | 2.79 |

By observed-game checkpoint, current-only → balanced normalized MSE: 1 game 2.459 → 0.399; 3 games 1.082 → 0.451; 5 games 0.672 → 0.333; 10 games 0.502 → 0.357; 15 games 0.563 → 0.466; 25 games 0.348 → 0.327.

## Limits

One season, thirteen held-out veterans, selected rosters, overlapping targets, no independent later-season retest. Estimates concern production **while playing**. Rookies, major role changes, long absences, future injuries, game caps, news interpretation and lineup optimization were not validated by this experiment. The model emits source/sample/role warnings and uses separate availability scenarios. Broader multi-season, forward-in-time validation is needed before stronger predictive claims.
