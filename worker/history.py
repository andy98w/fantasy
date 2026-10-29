"""Read this season's completed matchups; never infer a final from the date."""
import math
from .espn import SyncError
from .normalize import normalize_matchup
from .rankings import CATS


def fetch_history(client, league):
    current = league['status']['currentMatchupPeriod']
    if not isinstance(current, int) or not 1 <= current <= 60:
        raise SyncError('Invalid matchup history range.')
    schedule = league.get('schedule') or []
    expected = {m['id'] for m in schedule if m.get('matchupPeriodId', current) < current
                and m.get('winner') in ('HOME', 'AWAY', 'TIE') and m.get('home') and m.get('away')}
    history, seen = [], set()
    # Four periods at a time keeps the payload bounded, even in long playoff rounds.
    for start in range(1, current, 4):
        periods = list(range(start, min(start + 4, current)))
        payload = client.get(client.league, [('view', 'mMatchupScore'), ('view', 'mScoreboard')],
                             {'schedule': {'filterMatchupPeriodIds': {'value': periods}}})
        matches = payload.get('schedule') if isinstance(payload, dict) else None
        if not isinstance(matches, list):
            raise SyncError('Matchup history is missing its schedule.')
        for m in matches:
            if m.get('matchupPeriodId') not in periods or m.get('id') is None or m['id'] in seen:
                raise SyncError('Matchup history returned duplicate or unexpected games.')
            seen.add(m['id'])
            if not m.get('home') or not m.get('away') or m.get('winner') not in ('HOME', 'AWAY', 'TIE'):
                continue
            match = normalize_matchup(m, client.season, include_players=False)
            if any(not all(isinstance(s['stats'].get(c), (int, float)) and math.isfinite(s['stats'][c]) and s['stats'][c] >= 0 for c in CATS)
                   for s in (match['home'], match['away'])):
                raise SyncError('Completed matchup history is missing category totals.')
            history.append(match)
    if not expected.issubset({m['id'] for m in history}):
        raise SyncError('Completed matchups are missing from history.')
    return sorted(history, key=lambda m: (m['period'], m['id']))


def previous_history(previous, league_id, season):
    if previous and previous.get('league', {}).get('id') == league_id and previous.get('league', {}).get('season') == season:
        matches={m['id']:m for m in previous.get('matchupHistory', [])}
        matches.update({m['id']:m for m in previous.get('matchups', []) if m.get('result') in ('HOME','AWAY','TIE')})
        return sorted(matches.values(), key=lambda m:(m['period'],m['id']))
    return []
