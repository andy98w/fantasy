"""Daily published power ratings. Seven-day changes compare Pacific calendar dates."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import math

PACIFIC = ZoneInfo('America/Los_Angeles')
MODEL_FIELDS = ('version', 'basis', 'minimumGames', 'poolRule')

def _date(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(PACIFIC).date()

def _model(snapshot):
    return {key: snapshot['model'].get(key) for key in MODEL_FIELDS}

def _point(snapshot):
    return {'date': _date(snapshot['syncedAt']).isoformat(), 'capturedAt': snapshot['syncedAt'],
            'model': _model(snapshot), 'ratings': {str(p['id']): p.get('power') for p in snapshot['players']}}

def _rated(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 100

def add_power_history(snapshot, previous=None):
    today = _date(snapshot['syncedAt'])
    target = (today - timedelta(days=7)).isoformat()
    same_league = previous and previous.get('mode') == snapshot['mode'] and all(
        previous.get('league', {}).get(k) == snapshot['league'][k] for k in ('id', 'season'))
    points = {}
    if same_league:
        for point in previous.get('powerHistory', []):
            if target <= point.get('date', '') <= today.isoformat():
                points[point['date']] = point
        # Seed upgrades from the last real snapshot too, without manufacturing past dates.
        prior = _point(previous)
        if target <= prior['date'] <= today.isoformat():
            points[prior['date']] = prior
    current = _point(snapshot)
    points[current['date']] = current
    baseline = points.get(target)
    if baseline and baseline.get('model') != _model(snapshot):
        baseline = None
    snapshot['powerBaselineAt'] = baseline['capturedAt'] if baseline else None
    for player in snapshot['players']:
        player['powerChange7d'] = None
        player['powerTrendStatus'] = 'unavailable'
        if not baseline or not _rated(player.get('power')):
            continue
        old = baseline['ratings'].get(str(player['id']))
        if not _rated(old):
            player['powerTrendStatus'] = 'new'
        else:
            player['powerChange7d'] = round(player['power'] - old, 1)
            player['powerTrendStatus'] = 'measured'
    # Kept in the stored snapshot, stripped by the web schema before sending to the browser.
    snapshot['powerHistory'] = [points[key] for key in sorted(points)]
