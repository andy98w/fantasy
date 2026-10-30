from copy import deepcopy
import json
import httpx
import pytest
from worker.activity import fetch_activity, normalize_activity, load_activity, CODES
from worker.espn import ESPNClient, SyncError


def topic(id='event', messages=None):
    return {'id': id, 'date': 1793327953473, 'messages': messages or [
        {'messageTypeId': 179, 'targetId': 100, 'to': 5},
        {'messageTypeId': 178, 'targetId': 200, 'to': 5},
    ]}


def test_actual_add_drop_fields_and_waiver_codes():
    event = normalize_activity(topic())
    assert event['moves'] == [
        {'type': 'DROP', 'playerId': 100, 'fromTeamId': 5, 'toTeamId': None, 'via': None},
        {'type': 'ADD', 'playerId': 200, 'fromTeamId': None, 'toTeamId': 5, 'via': 'FREEAGENT'},
    ]
    waiver = normalize_activity(topic(messages=[
        {'messageTypeId': 180, 'targetId': 1, 'from': 0, 'to': 7},
        {'messageTypeId': 181, 'targetId': 2, 'to': 7},
        {'messageTypeId': 239, 'targetId': 3, 'from': 12, 'to': -1, 'for': 1},
    ]))
    assert waiver['moves'][0]['via'] == 'WAIVERS'
    assert waiver['moves'][1]['fromTeamId'] == 7
    assert waiver['moves'][2]['fromTeamId'] == 1  # Not bench slot 12.


def test_only_completed_trades_and_no_lineup_moves_or_deleted_activity():
    move = {'messageTypeId': 244, 'targetId': 100, 'from': 1, 'to': 2}
    event = topic(messages=[move, deepcopy(move), {'messageTypeId': 224, 'targetId': 200}, {'messageTypeId': 188, 'targetId': 300}, {'messageTypeId': 178, 'targetId': 400, 'to': 1, 'isDeleted': True}])
    assert normalize_activity(event)['moves'] == [{'type': 'TRADE', 'playerId': 100, 'fromTeamId': 1, 'toTeamId': 2, 'via': None}]
    event['isDeleted'] = True
    assert normalize_activity(event) is None


def test_pages_and_order():
    offsets = []
    def handle(request):
        assert request.method == 'GET'
        filters = json.loads(request.headers['x-fantasy-filter'])['topics']
        assert filters['filterIncludeMessageTypeIds']['value'] == CODES
        offset = filters['offset']; offsets.append(offset)
        return httpx.Response(200, json={'topics': [topic(str(i)) for i in range(100)] if offset == 0 else [topic('last')]})
    with ESPNClient(1, 2027, transport=httpx.MockTransport(handle)) as client:
        events = fetch_activity(client)
    assert len(events) == 101 and offsets == [0, 100]
    assert len({event['id'] for event in events}) == 101


@pytest.mark.parametrize('payload', [{}, {'topics': [topic('same'), topic('same')]}, {'topics': [topic(messages=[{'messageTypeId': 239, 'targetId': 1, 'from': 12, 'to': -1}])]}, {'topics': [topic(messages=[{'messageTypeId': 244, 'targetId': 1, 'from': 2, 'to': 2}])]}, {'topics': [{**topic(), 'date': 'bad'}]}, {'topics': [{**topic(), 'messages': topic()['messages'] * 50}]}])
def test_invalid_feed_keeps_previous_same_season_activity(payload):
    old = {'league': {'id': 1, 'season': 2027}, 'transactions': [normalize_activity(topic())]}
    with ESPNClient(1, 2027, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=payload))) as client:
        with pytest.raises(SyncError): fetch_activity(client)
        events, error = load_activity(client, old, 1, 2027)
        assert events == old['transactions'] and error
        assert load_activity(client, old, 1, 2028)[0] == []
        assert load_activity(client, old, 2, 2027)[0] == []
