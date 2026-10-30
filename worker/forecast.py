"""Small, optional schedule payload for legal-lineup forecasts.

Regular ESPN weekly periods are Monday–Sunday (the opening week starts on
opening night). Unsupported calendars/lineup restrictions disable projections;
none of these failures should prevent the league itself from importing.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo('America/Los_Angeles')


def forecast_schedule(raw, slots):
    try:
        league = raw['league']
        settings = league['settings']
        roster = settings['rosterSettings']
        calendar = settings['scheduleSettings']
        # Do not silently apply daily optimization to weekly locks or game caps.
        if (calendar.get('periodTypeId') != 2 or
                roster.get('lineupLocktimeType') != 'INDIVIDUAL_GAME' or
                any(roster.get('lineupSlotStatLimits', {}).values())):
            return None
        active = [slots[int(k)] for k, n in roster['lineupSlotCounts'].items()
                  if int(k) not in (12, 13) for _ in range(n)]
        if not active or len(active) > 12:
            return None
        teams = raw['nbaSchedule']['settings']['proTeams']
        names = {t['id']: t['abbrev'] for t in teams}
        games = {}
        for team in teams:
            for day_games in team.get('proGamesByScoringPeriod', {}).values():
                for game in day_games:
                    start = datetime.fromtimestamp(game['date'] / 1000, timezone.utc)
                    item = {'id': str(game['id']), 'startsAt': start.isoformat(),
                            'date': start.astimezone(PACIFIC).date().isoformat(),
                            'home': names[game['homeProTeamId']], 'away': names[game['awayProTeamId']],
                            'scoringPeriod': game['scoringPeriodId']}
                    if item['id'] in games and games[item['id']] != item:
                        return None
                    games[item['id']] = item
        opening = min(datetime.fromisoformat(g['startsAt']).astimezone(PACIFIC).date()
                      for g in games.values() if g['scoringPeriod'] == 1)
        monday = opening - timedelta(days=opening.weekday())
        current_day = opening + timedelta(days=league['scoringPeriodId'] - 1)
        current = league['status']['currentMatchupPeriod']
        windows = []
        for period in (current, current + 1):
            weeks = calendar['matchupPeriods'].get(str(period))
            # Multi-week playoffs and special calendars need explicit date metadata.
            if not weeks or len(weeks) != 1:
                continue
            start = monday + timedelta(weeks=weeks[0] - 1)
            end = start + timedelta(days=6)
            windows.append({'period': period, 'start': max(start, opening).isoformat(), 'end': end.isoformat()})
        current_window = next((w for w in windows if w['period'] == current), None)
        if not current_window or not current_window['start'] <= current_day.isoformat() <= current_window['end']:
            return None
        first, last = windows[0]['start'], windows[-1]['end']
        relevant = sorted((g for g in games.values() if first <= g['date'] <= last), key=lambda g: (g['startsAt'], g['id']))
        if not relevant:
            return None
        pairs = [{'period': m['matchupPeriodId'], 'home': m['home']['teamId'], 'away': m['away']['teamId']}
                 for m in league.get('schedule', []) if m.get('home') and m.get('away')
                 and m['matchupPeriodId'] in [w['period'] for w in windows]]
        return {'lineupDate': current_day.isoformat(), 'windows': windows, 'games': relevant, 'pairs': pairs, 'slots': active}
    except (KeyError, TypeError, ValueError, OverflowError):
        return None
