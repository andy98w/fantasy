# Rankings v1

This release measures observed season-per-game player value. It does not project future production, simulate weekly outcomes, or optimize lineups.

## Player value

The comparison pool is the top N players by minutes per game among players with at least three games and complete PTS, REB, AST, STL, BLK, 3PM, TO, FGM, FGA, FTM, FTA. N is league team count × non-IR roster slots + 24, capped by eligible coverage. The pool IDs and model version are saved with the snapshot. UI filters never recompute the pool.

Counting-category contribution is `(value − pool mean) / pool standard deviation`. Turnovers use the opposite sign. A category with zero variance contributes zero.

The percentage baseline is the pool's total per-game makes divided by total per-game attempts. Player shooting impact is `makes − baseline × attempts`. The impact is standardized like other categories. Zero attempts produce zero impact; missing attempts make a player ineligible. Displayed player percentages are recomputed from makes and attempts.

Sum the nine category contributions for `zTotal`. Display `power` as the empirical midrank percentile of that total within the reference pool (0–100); it is not a win probability. Order eligible players by total value. Minimum-game thresholds and fixed pool selection are explicit model choices, not ESPN rankings.

## Team value

`talent` is the sum of all rostered players' `zTotal`, including bench and injured players. To avoid comparing complete and incomplete rosters, teams with any unrated player have no overall talent score or rank. Category profiles still show the sum of available contributions, alongside coverage counts. This can leave team rankings unavailable very early in the season.

## Later work

A proper team-power model needs pooled shooting attempts, projected production, legal lineup assignment, actual games remaining, injury assumptions, and scoring-format-aware objectives. Backtest on historical matchup snapshots before exposing win probabilities. Explore [G-scores](https://arxiv.org/abs/2307.02188) once game-to-game uncertainty can be estimated. A season-average z-score sum should never be described as predicted team strength.
