from copy import deepcopy
from worker.recap import load_recap_rosters


def fixture():
    snapshot = {'league': {'id': 1, 'season': 2027, 'scoringPeriod': 24},
                'teams': [{'id': 3}], 'players': [{'id': 10, 'slot': 'BE'}],
                'forecastSchedule': {'lineupDate': '2026-11-12'}}
    raw = {'nbaSchedule': {'settings': {'proTeams': [{'proGamesByScoringPeriod': {
        '23': [{'scoringPeriodId': 23}], '24': [{'scoringPeriodId': 24}]}}]}}}
    response = {'id': 1, 'seasonId': 2027, 'scoringPeriodId': 23, 'teams': [
        {'id': 3, 'roster': {'entries': [{'lineupSlotId': 5, 'playerPoolEntry': {'player': {'id': 10}}}]}}]}
    class Client:
        league = 'test'
        calls = 0
        def get(self, url, params):
            self.calls += 1
            assert params == {'view': 'mRoster', 'scoringPeriodId': 23}
            return response
    return snapshot, raw, response, Client()


def test_recap_recovers_actual_past_slot_and_reuses_saved_roster():
    snapshot, raw, response, client = fixture()
    rosters = load_recap_rosters(client, snapshot, raw)
    assert rosters[0]['date'] == '2026-11-11'
    assert rosters[0]['lineups'][0]['entries'] == [{'playerId': 10, 'slot': 'G'}]
    assert snapshot['players'][0]['slot'] == 'BE'
    assert load_recap_rosters(client, snapshot, raw, {**snapshot, 'recapRosters': rosters}) == rosters
    assert client.calls == 1


def test_recap_rejects_wrong_period_identity_and_partial_rosters():
    for key, value in [('id', 2), ('seasonId', 2026), ('scoringPeriodId', 24), ('teams', []),
                       ('teams', [{'id': 3}])]:
        snapshot, raw, response, client = fixture()
        response[key] = value
        assert load_recap_rosters(client, snapshot, raw) == []


def test_recap_outage_keeps_prior_history_without_using_foreign_league_cache():
    snapshot, raw, response, client = fixture()
    previous = deepcopy(snapshot)
    previous['recapRosters'] = load_recap_rosters(client, snapshot, raw)
    def fail(*args):
        raise TimeoutError()
    client.get = fail
    previous['recapRosters'][0]['date'] = '2026-11-10'
    assert load_recap_rosters(client, snapshot, raw, previous) == previous['recapRosters']
    previous['league']['id'] = 2
    assert load_recap_rosters(client, snapshot, raw, previous) == []
