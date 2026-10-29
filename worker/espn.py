"""Bounded, read-only ESPN adapter. No ESPN mutation endpoints exist here.

Endpoint/stat conventions: https://github.com/cwendt94/espn-api (MIT).
Direct HTTP retains raw payloads and allows timeouts, retries, pagination validation.
"""
from __future__ import annotations
import json
import time
import httpx

BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba'

class SyncError(Exception):
    """Safe-to-display error: never includes response bodies, headers or cookies."""

class ESPNClient:
    def __init__(self, league_id: int, season: int, s2: str = '', swid: str = '', transport=None):
        self.season = season
        self.base = f'{BASE}/seasons/{season}'
        self.league = f'{self.base}/segments/0/leagues/{league_id}'
        cookies = {'espn_s2': s2, 'SWID': swid} if s2 and swid else {}
        self.client = httpx.Client(cookies=cookies, timeout=25, transport=transport,
                                  headers={'User-Agent': 'Fantasy/0.1 (personal league reader)'})

    def __enter__(self): return self
    def __exit__(self, *_): self.client.close()

    def get(self, url, params=None, filters=None):
        for attempt in range(3):
            try:
                response = self.client.get(url, params=params,
                    headers={'x-fantasy-filter': json.dumps(filters)} if filters else None)
            except httpx.RequestError:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise SyncError('ESPN could not be reached. Last successful data was preserved.') from None
            if response.status_code in (401, 403):
                raise SyncError('ESPN access denied. Configure or renew ESPN_S2 and ESPN_SWID in server secrets.')
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
            if response.status_code != 200:
                raise SyncError(f'ESPN returned HTTP {response.status_code}. Last successful data was preserved.')
            try:
                return response.json()
            except ValueError:
                raise SyncError('ESPN returned an unexpected response format.') from None
        raise SyncError('ESPN retry limit reached.')

    def fetch(self):
        league = self.get(self.league, [('view', v) for v in ('mSettings','mTeam','mRoster','mMatchup')])
        if not isinstance(league, dict) or not league.get('teams') or 'settings' not in league:
            raise SyncError('League response is missing teams or settings.')
        period = league.get('status', {}).get('currentMatchupPeriod')
        scoring = league.get('scoringPeriodId')
        if period is None or scoring is None:
            raise SyncError('ESPN did not provide the current matchup/scoring period.')
        scores = self.get(self.league,
            [('view','mMatchupScore'),('view','mScoreboard'),('scoringPeriodId',str(scoring))],
            {'schedule': {'filterMatchupPeriodIds': {'value':[period]}}})
        # Fetch the full league player pool, without FREEAGENT-only or active-only filters.
        entries, seen = [], set()
        page_size = 250
        for offset in range(0, 10000, page_size):
            data = self.get(self.league, {'view':'kona_player_info','scoringPeriodId':scoring},
                {'players': {'limit':page_size, 'offset':offset,
                             'sortPercOwned':{'sortPriority':1,'sortAsc':False}}})
            page = data.get('players') if isinstance(data,dict) else None
            if not isinstance(page,list): raise SyncError('ESPN player page is missing its player list.')
            ids = [p.get('player',{}).get('id',p.get('id')) for p in page]
            if any(i is None or i in seen for i in ids) or len(ids) != len(set(ids)):
                raise SyncError('ESPN player pagination repeated or omitted IDs; refusing an incomplete import.')
            seen.update(ids)
            entries.extend(page)
            # total may not be present; an additional empty page confirms exact multiples.
            if len(page) < page_size:
                expected = data.get('total')
                if isinstance(expected,int) and expected != len(entries):
                    raise SyncError('ESPN player total differs from imported count.')
                break
        else: raise SyncError('ESPN player pool exceeded the pagination safety limit.')
        if not entries: raise SyncError('ESPN returned an empty player pool.')
        schedule = self.get(self.base, {'view':'proTeamSchedules_wl'})
        return {'league':league, 'scores':scores, 'players':entries, 'nbaSchedule':schedule}
