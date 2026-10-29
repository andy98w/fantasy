# Implementation milestones

## Built in the first slice

- Next.js dashboard: overview, matchup selection, team roster selection, player search and sorting, standings, roster talent heatmap, player details, news filtering, connection status.
- ESPN read adapter: authentication, complete player pagination, explicit scoring/matchup periods, strict nine-category checks, ownership reconciliation.
- Python normalization, descriptive player rankings, safe news ingestion, local snapshot persistence, PostgreSQL transaction path.
- Public dashboard access, server-only ESPN credentials, schema validation, stale-data presentation.
- Docker, Railway service definitions, and GitHub checks.

## Acceptance gate: real league

Initial authenticated import completed locally. Current matchups reconcile arithmetically with source payloads; private snapshots are excluded from Git. Remaining acceptance work:

- Configure private ESPN credentials locally or in worker secrets.
- Verify all teams and players, current rosters and ownership, each current matchup category, and league scoring rules.
- Record any payload differences in sanitized test fixtures.
- Prove PostgreSQL ingestion and application reads end-to-end in the target host.

## Next increments

1. Split daily player/directory updates from frequent roster and matchup syncs; add job monitoring and retention.
2. Normalize NBA schedules and historical daily lineups/game logs; validate games remaining against ESPN.
3. Add prior/current-season projection blending, lineup-aware weekly totals, pooled percentages and uncertainty.
4. Backtest neutral-schedule team power and weekly matchup probabilities; evaluate G-score alternatives.
5. Add browser-local favorites, saved filters, and historical ranking movement.

No fake projections, invented trend changes, or fabricated live news are shown in the initial interface. The demo is explicitly fictional and never used as a fallback in live mode.
