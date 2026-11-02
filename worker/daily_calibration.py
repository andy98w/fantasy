"""Optional daily calibration from a bounded, cached sample of real NBA games.

The 28-day window ends two Pacific days ago, excluding both today's games and
the morning recap. Only regular-season final games and 10+ minute appearances
of players in the current season reference pool qualify. No synthetic samples.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from statistics import mean, pstdev
import json
import math
import os
from pathlib import Path
import httpx
from .rankings import CATS, REQUIRED

BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/'
ZONE = ZoneInfo('America/Los_Angeles')
COUNTS = {'points': 'PTS', 'rebounds': 'REB', 'assists': 'AST', 'steals': 'STL', 'blocks': 'BLK', 'turnovers': 'TO'}
SHOTS = {'fieldGoalsMade-fieldGoalsAttempted': ('FGM', 'FGA'), 'freeThrowsMade-freeThrowsAttempted': ('FTM', 'FTA'), 'threePointFieldGoalsMade-threePointFieldGoalsAttempted': ('3PM', '3PA')}

def complete(stats):
    return all(isinstance(stats.get(k), (int, float)) and math.isfinite(stats[k]) and stats[k] >= 0 for k in REQUIRED) and stats['FGM'] <= stats['FGA'] and stats['FTM'] <= stats['FTA']

def box_lines(payload, game_id):
    if payload.get('header', {}).get('id') != game_id: raise ValueError('Wrong game')
    teams = payload['boxscore']['players']
    if len(teams) != 2: raise ValueError('Incomplete box score')
    lines, seen = [], set()
    for team in teams:
        for group in team['statistics']:
            for row in group['athletes']:
                if row.get('didNotPlay'): continue
                values = dict(zip(group['keys'], row['stats']))
                minute = str(values.get('minutes', '')).split(':')
                if not minute[0].isdigit(): continue
                minutes = int(minute[0]) + (int(minute[1]) / 60 if len(minute) == 2 else 0)
                if minutes < 10: continue
                stats = {cat: float(values[key]) for key, cat in COUNTS.items()}
                for key, (made, attempts) in SHOTS.items():
                    a, b = str(values[key]).split('-')
                    stats[made], stats[attempts] = float(a), float(b)
                pid = int(row['athlete']['id'])
                if pid in seen or not complete(stats): raise ValueError('Invalid player line')
                seen.add(pid)
                lines.append({'playerId': pid, 'stats': stats})
    return lines

def calibrate(snapshot, games, start, end):
    ids = set(snapshot['model']['poolIds'])
    pool = [p for p in snapshot['players'] if p['id'] in ids and p['gamesPlayed'] >= snapshot['model']['minimumGames'] and complete(p['stats'])]
    if len(pool) < 2: return None
    fg_attempts, ft_attempts = (sum(p['stats'][key] for p in pool) for key in ('FGA', 'FTA'))
    if not fg_attempts or not ft_attempts: return None
    fg = sum(p['stats']['FGM'] for p in pool) / fg_attempts
    ft = sum(p['stats']['FTM'] for p in pool) / ft_attempts
    def vector(s, c):
        return s['FGM'] - fg * s['FGA'] if c == 'FG%' else s['FTM'] - ft * s['FTA'] if c == 'FT%' else s[c]
    distributions = {c: (mean(vector(p['stats'], c) for p in pool), pstdev(vector(p['stats'], c) for p in pool)) for c in CATS}
    def score(s):
        return sum(((vector(s, c) - avg) / sd if sd > 1e-12 else 0) * (-1 if c == 'TO' else 1) for c, (avg, sd) in distributions.items())
    # ID deduplication prevents adjacent Eastern feeds from overweighting games.
    eligible = {g['id']: g for g in games if start <= g['date'] <= end}
    samples = [(g['date'], score(row['stats'])) for g in eligible.values() for row in g['lines'] if row['playerId'] in ids and complete(row['stats'])]
    dates = {date for date, _ in samples}
    if len(samples) < 300 or len(dates) < 7: return None
    values = sorted(value for _, value in samples)
    position = (len(values) - 1) * .1
    low, high = math.floor(position), math.ceil(position)
    cutoff = values[low] + (values[high] - values[low]) * (position - low)
    return {'version': 'daily-history-v1', 'from': min(dates), 'to': end,
            'sampleSize': len(values), 'gameCount': len(eligible), 'dayCount': len(dates),
            'percentile': .1, 'cutoff': min(0, cutoff), 'scoredAt': snapshot['syncedAt'],
            'source': 'ESPN final NBA box scores'}

def load_calibration(snapshot, cache_path, request=None):
    """Fetch once daily; rescoring the cached sample uses each fresh reference pool.

    Partial fetches are rejected rather than publishing a biased smaller sample.
    The caller treats failures as optional, preserving the main league import.
    """
    today = datetime.fromisoformat(snapshot['syncedAt']).astimezone(ZONE).date()
    end = today - timedelta(days=2)
    start = end - timedelta(days=27)
    cache_path = Path(cache_path)
    try: cache = json.loads(cache_path.read_text())
    except (OSError, ValueError): cache = {}
    if cache.get('season') != snapshot['league']['season']: cache = {}
    if cache.get('through') == end.isoformat():
        return calibrate(snapshot, cache['games'], start.isoformat(), end.isoformat())
    with httpx.Client(timeout=8) as client:
        def get(url):
            if request: return request(url)
            response = client.get(url); response.raise_for_status()
            return response.json()
        dates = [start + timedelta(days=i) for i in range(29)]
        with ThreadPoolExecutor(max_workers=4) as executor:
            feeds = list(executor.map(lambda day: get(f'{BASE}scoreboard?dates={day:%Y%m%d}&limit=1000'), dates))
            wanted = {}
            for feed in feeds:
                for event in feed['events']:
                    season = event.get('season', {})
                    if season.get('year') != snapshot['league']['season'] or season.get('type') != 2: continue
                    date = datetime.fromisoformat(event['date'].replace('Z', '+00:00')).astimezone(ZONE).date()
                    if start <= date <= end and event['status']['type'].get('completed'):
                        wanted[event['id']] = date.isoformat()
            saved = {g['id']: g for g in cache.get('games', [])}
            def game(item):
                gid, date = item
                # Refresh recent games for corrections, reuse older final boxes.
                if gid in saved and date < (end - timedelta(days=2)).isoformat(): return saved[gid]
                return {'id': gid, 'date': date, 'lines': box_lines(get(f'{BASE}summary?event={gid}'), gid)}
            games = list(executor.map(game, wanted.items()))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache_path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'season': snapshot['league']['season'], 'through': end.isoformat(), 'games': games}, allow_nan=False))
    os.replace(temporary, cache_path)
    return calibrate(snapshot, games, start.isoformat(), end.isoformat())
