"""Scored matchup production, reconciled with ESPN's team totals before MVP use."""
import math

COUNTS = {'0':'PTS','1':'BLK','2':'STL','3':'AST','6':'REB','11':'TO','13':'FGM','14':'FGA','15':'FTM','16':'FTA','17':'3PM'}

def weekly_players(side, season):
    entries = (side.get('rosterForMatchupPeriod') or {}).get('entries')
    if not isinstance(entries, list): return [], False
    players, seen = [], set()
    complete = True
    for entry in entries:
        player = entry.get('playerPoolEntry', {}).get('player', {})
        splits = [s for s in player.get('stats', []) if s.get('seasonId') == season and s.get('statSourceId') == 0 and s.get('statSplitTypeId') == 5]
        if len(splits) != 1:
            complete = False
            continue
        raw = splits[0].get('stats', {})
        if not all(isinstance(raw.get(k), (int, float)) and math.isfinite(raw[k]) and raw[k] >= 0 for k in [*COUNTS, '42']):
            complete = False
            continue
        pid = player.get('id')
        if not isinstance(pid, int) or pid in seen:
            complete = False
            continue
        seen.add(pid)
        stats = {name: raw[k] for k, name in COUNTS.items()}
        stats['GP'] = raw['42']
        if stats['FGM'] > stats['FGA'] or stats['FTM'] > stats['FTA']:
            complete = False
            continue
        stats['FG%'] = stats['FGM'] / stats['FGA'] if stats['FGA'] else None
        stats['FT%'] = stats['FTM'] / stats['FTA'] if stats['FTA'] else None
        players.append({'playerId': pid, 'name': player.get('fullName', f'Player {pid}'), 'stats': stats})
    official = (side.get('cumulativeScore') or {}).get('scoreByStat') or {}
    for key, name in COUNTS.items():
        expected = official.get(key, {}).get('score')
        if not isinstance(expected, (int, float)) or not math.isfinite(expected) or abs(sum(p['stats'][name] for p in players) - expected) > .01:
            complete = False
    return players, complete
