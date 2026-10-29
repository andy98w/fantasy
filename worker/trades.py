"""Read completed, current-season trade activity; never sends ESPN mutations."""
from datetime import datetime, timezone
from .espn import SyncError


def fetch_trades(client):
    trades, seen = [], set()
    for offset in range(0, 10000, 100):
        data = client.get(client.league + '/communication/', {'view': 'kona_league_communication'}, {
            'topics': {'filterType': {'value': ['ACTIVITY_TRANSACTIONS']},
                       'filterIncludeMessageTypeIds': {'value': [244]},
                       'limit': 100, 'offset': offset,
                       'limitPerMessageSet': {'value': 100},
                       'sortMessageDate': {'sortPriority': 1, 'sortAsc': False}}})
        topics = data.get('topics')
        if not isinstance(topics, list):
            raise SyncError('Trade history unavailable.')
        for topic in topics:
            tid = str(topic.get('id', ''))
            if not tid or tid in seen:
                raise SyncError('Trade history pagination repeated or omitted IDs.')
            seen.add(tid)
            moves = set()
            for message in topic.get('messages', []):
                if message.get('messageTypeId') != 244:
                    continue
                values = tuple(message.get(k) for k in ('targetId', 'from', 'to'))
                if not all(isinstance(v, int) and not isinstance(v, bool) and v > 0 for v in values) or values[1] == values[2]:
                    raise SyncError('Trade history contains an incomplete player move.')
                moves.add(values)
            if not moves:
                continue
            if len(topic.get('messages', [])) >= 100:
                raise SyncError('Trade history message limit reached.')
            date = datetime.fromtimestamp(topic['date'] / 1000, timezone.utc).isoformat()
            trades.append({'id': tid, 'completedAt': date,
                           'moves': [{'playerId': p, 'fromTeamId': a, 'toTeamId': b} for p, a, b in sorted(moves)]})
        if len(topics) < 100:
            return sorted(trades, key=lambda t: t['completedAt'], reverse=True)
    raise SyncError('Trade history pagination limit reached.')
