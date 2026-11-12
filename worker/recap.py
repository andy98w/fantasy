"""Keep the latest past NBA slate's actual ESPN roster beyond snapshot pruning."""
from datetime import datetime, timedelta, timezone
from .normalize import SLOTS


def load_recap_rosters(client, snapshot, raw, previous=None):
    schedule = snapshot.get('forecastSchedule') or {}
    today = schedule.get('lineupDate')
    if not today:
        return []
    scoring = snapshot['league']['scoringPeriod']
    opening = datetime.fromisoformat(today).date() - timedelta(days=scoring - 1)
    # The complete NBA schedule includes the previous week at Monday rollover.
    periods = {game['scoringPeriodId']
               for team in raw.get('nbaSchedule', {}).get('settings', {}).get('proTeams', [])
               for games in team.get('proGamesByScoringPeriod', {}).values()
               for game in games if 0 < game.get('scoringPeriodId', 0) < scoring}
    if not periods:
        return []
    period = max(periods)
    date = (opening + timedelta(days=period - 1)).isoformat()
    same = previous and all(previous.get('league', {}).get(k) == snapshot['league'][k] for k in ('id', 'season'))
    saved = [r for r in (previous.get('recapRosters', []) if same else []) if r.get('date', '') < today]
    if any(r['date'] == date for r in saved):
        return sorted(saved, key=lambda r: r['date'])[-7:]
    try:
        data = client.get(client.league, {'view': 'mRoster', 'scoringPeriodId': period})
        if (data.get('id') != snapshot['league']['id'] or data.get('seasonId') != snapshot['league']['season']
                or data.get('scoringPeriodId') != period):
            raise ValueError('Historical roster identity mismatch')
        teams = data.get('teams', [])
        if sorted(t['id'] for t in teams) != sorted(t['id'] for t in snapshot['teams']):
            raise ValueError('Incomplete historical teams')
        lineups, ids = [], set()
        for team in teams:
            entries = team.get('roster', {}).get('entries')
            if not isinstance(entries, list):
                raise ValueError('Missing historical roster')
            rows = []
            for entry in entries:
                player_id = entry.get('playerPoolEntry', {}).get('player', {}).get('id')
                if not isinstance(player_id, int) or player_id <= 0 or player_id in ids:
                    raise ValueError('Ambiguous historical player')
                ids.add(player_id)
                rows.append({'playerId': player_id, 'slot': SLOTS.get(entry.get('lineupSlotId'))})
            lineups.append({'teamId': team['id'], 'entries': rows})
        profiles = {p['id']: p for p in (previous.get('players', []) if same else [])}
        profiles.update({p['id']: p for p in snapshot['players']})
        if not ids.issubset(profiles):
            raise ValueError('Missing historical player profile')
        saved.append({'date': date, 'capturedAt': datetime.now(timezone.utc).isoformat(),
                      'lineups': lineups, 'players': [profiles[i] for i in sorted(ids)]})
    except Exception:
        # Optional recap failures must not block fresh league/score imports.
        pass
    return sorted(saved, key=lambda r: r['date'])[-7:]
