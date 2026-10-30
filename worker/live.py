"""Continuous hosted worker: full imports every five minutes, live scores every 30s."""
from argparse import Namespace
from datetime import datetime, timezone, timedelta
import os
import signal
import sys
import time
from threading import Event
from zoneinfo import ZoneInfo

import httpx
import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb
from .espn import ESPNClient, SyncError
from .normalize import normalize_matchup
from .rankings import CATS
from .sync import ROOT, run
import math


def normalize_live(payload, snapshot):
    period = snapshot['league']['matchupPeriod']
    expected = {m['id']: (m['home']['teamId'], m['away']['teamId']) for m in snapshot['matchups']}
    matches = [normalize_matchup(m, snapshot['league']['season']) for m in payload.get('schedule', [])]
    if not expected or len(matches) != len(expected) or {m['id'] for m in matches} != set(expected):
        raise SyncError('Live scoreboard incomplete; keeping saved scores.')
    for m in matches:
        if m['period'] != period or (m['home']['teamId'], m['away']['teamId']) != expected[m['id']]:
            raise SyncError('Live scoreboard period changed; waiting for full import.')
        for side in (m['home'], m['away']):
            if not all(isinstance(side['stats'].get(c), (int, float)) and math.isfinite(side['stats'][c]) and side['stats'][c] >= 0 for c in CATS):
                raise SyncError('Live scoreboard missing category totals.')
            if not isinstance(side['wins'], (int, float)) or not 0 <= side['wins'] <= 9:
                raise SyncError('Live scoreboard missing category wins.')
    return {'leagueId': snapshot['league']['id'], 'season': snapshot['league']['season'],
            'period': period, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'matchups': matches}


def refresh_scores():
    league_id = int(os.environ.get('ESPN_LEAGUE_ID', '1834203755'))
    season = int(os.environ.get('ESPN_SEASON', '2027'))
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SyncError('Live score worker requires DATABASE_URL.')
    with psycopg.connect(db, autocommit=True, connect_timeout=10, options='-c statement_timeout=10000') as conn:
        # Shared with full imports, preventing overlapping old/new deployments.
        if not conn.execute('SELECT pg_try_advisory_lock(%s,%s)', (league_id, season)).fetchone()[0]:
            return
        row = conn.execute('SELECT payload FROM league_snapshots WHERE league_id=%s AND season=%s ORDER BY captured_at DESC,id DESC LIMIT 1', (league_id, season)).fetchone()
        if not row: return
        snapshot = row[0]
        with ESPNClient(league_id, season, os.environ.get('ESPN_S2', ''), os.environ.get('ESPN_SWID', '')) as client:
            payload = client.get(client.league, [('view', 'mMatchupScore'), ('view', 'mScoreboard')],
                {'schedule': {'filterMatchupPeriodIds': {'value': [snapshot['league']['matchupPeriod']]}}})
        value = normalize_live(payload, snapshot)
        conn.execute('INSERT INTO league_live_scores (league_id,season,payload) VALUES (%s,%s,%s) ON CONFLICT (league_id,season) DO UPDATE SET payload=excluded.payload', (league_id, season, Jsonb(value)))
        print('Live matchup scores refreshed.', flush=True)


def games_active():
    # Include a final-game grace period for late stat corrections.
    day = datetime.now(ZoneInfo('America/Los_Angeles')).date()
    now = datetime.now(timezone.utc)
    for date in (day, day + timedelta(days=1)):
        response = httpx.get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', params={'dates': date.strftime('%Y%m%d')}, timeout=6)
        response.raise_for_status()
        for event in response.json()['events']:
            start = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
            if event['status']['type']['state'] == 'in' or start <= now <= start + timedelta(hours=5):
                return True
    return False


def watch(stopped, clock=time.monotonic):
    full_due = active_due = 0
    active = True
    while not stopped.is_set():
        now = clock()
        if now >= full_due:
            try:
                run(Namespace(probe=False, news_only=False))
            except Exception:
                print('Full import failed; keeping saved data and retrying in five minutes.', file=sys.stderr, flush=True)
            full_due = clock() + 300
        if now >= active_due:
            try: active = games_active()
            except Exception: active = True  # Scoreboard outage must not stop fantasy updates.
            active_due = clock() + 60
        if active and not stopped.is_set():
            try: refresh_scores()
            except Exception:
                print('Live score refresh failed; keeping saved scores.', file=sys.stderr, flush=True)
        stopped.wait(30)


def main():
    load_dotenv(ROOT / '.env')
    if not os.environ.get('DATABASE_URL'):
        raise SyncError('Continuous hosted worker requires DATABASE_URL.')
    stopped = Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    print('Continuous sync: full imports every 5 minutes; active-game scores every 30 seconds.', flush=True)
    watch(stopped)

if __name__ == '__main__': main()
