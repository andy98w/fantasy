"""Current-season completed roster activity from ESPN's read-only feed.

Message codes/team fields follow espn-api's basketball Activity adapter:
https://github.com/cwendt94/espn-api/blob/master/espn_api/basketball/activity.py
"""
from datetime import datetime, timezone
from .espn import SyncError

CODES = [178, 180, 179, 181, 239, 244]


def positive_id(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def normalize_activity(topic):
    if topic.get('isDeleted'):
        return None
    messages = topic.get('messages')
    if not isinstance(messages, list) or len(messages) >= 100:
        raise SyncError('Activity history contains an incomplete transaction.')
    moves, seen = [], set()
    for message in messages:
        code = message.get('messageTypeId')
        if code not in CODES or message.get('isDeleted'):
            continue
        player = message.get('targetId')
        if code == 244:
            kind, source, destination, via = 'TRADE', message.get('from'), message.get('to'), None
        elif code in (178, 180):
            kind, source, destination = 'ADD', None, message.get('to')
            via = 'WAIVERS' if code == 180 else 'FREEAGENT'
        else:
            # 239.from is a lineup slot, not the team. 179/181.to is the dropping team.
            kind, source, destination, via = 'DROP', message.get('for') if code == 239 else message.get('to'), None, None
        if not positive_id(player) or (kind != 'ADD' and not positive_id(source)) or (kind != 'DROP' and not positive_id(destination)) or (kind == 'TRADE' and source == destination):
            raise SyncError('Activity history contains an incomplete player move.')
        signature = (kind, player, source, destination, via)
        if signature in seen:
            continue
        seen.add(signature)
        moves.append({'type': kind, 'playerId': player, 'fromTeamId': source, 'toTeamId': destination, 'via': via})
    if not moves:
        return None
    try:
        date = datetime.fromtimestamp(topic['date'] / 1000, timezone.utc).isoformat()
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        raise SyncError('Activity history contains an invalid date.') from None
    return {'id': str(topic['id']), 'completedAt': date, 'moves': moves}


def fetch_activity(client):
    events, seen = [], set()
    for offset in range(0, 10000, 100):
        payload = client.get(client.league + '/communication/', {'view': 'kona_league_communication'}, {
            'topics': {'filterType': {'value': ['ACTIVITY_TRANSACTIONS']},
                       'filterIncludeMessageTypeIds': {'value': CODES},
                       'limit': 100, 'offset': offset, 'limitPerMessageSet': {'value': 100},
                       'sortMessageDate': {'sortPriority': 1, 'sortAsc': False},
                       'sortFor': {'sortPriority': 2, 'sortAsc': False}}})
        topics = payload.get('topics') if isinstance(payload, dict) else None
        if not isinstance(topics, list):
            raise SyncError('Activity history unavailable.')
        for topic in topics:
            tid = str(topic.get('id') or '')
            if not tid or tid in seen:
                raise SyncError('Activity history pagination repeated or omitted IDs.')
            seen.add(tid)
            event = normalize_activity(topic)
            if event:
                events.append(event)
        if len(topics) < 100:
            return sorted(events, key=lambda event: (event['completedAt'], event['id']), reverse=True)
    raise SyncError('Activity history pagination limit reached.')


def load_activity(client, previous, league_id, season):
    """Keep the last successful ledger on an optional feed outage."""
    try:
        return fetch_activity(client), None
    except Exception:
        old = previous if previous and previous.get('league', {}).get('id') == league_id and previous.get('league', {}).get('season') == season else {}
        return old.get('transactions', []), 'Activity history could not refresh.'
