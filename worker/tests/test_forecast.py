from datetime import datetime, timezone
from worker.forecast import forecast_schedule
from worker.normalize import SLOTS


def fixture():
    def game(id, date, scoring):
        return {'id': id, 'date': datetime.fromisoformat(date).replace(tzinfo=timezone.utc).timestamp()*1000,
                'homeProTeamId': 1, 'awayProTeamId': 2, 'scoringPeriodId': scoring}
    games = {'1': [game(1, '2026-10-21T01:00:00', 1)], '10': [game(2, '2026-10-30T01:00:00', 10)],
             '14': [game(3, '2026-11-03T01:00:00', 14)]}
    return {'league': {'scoringPeriodId': 10, 'status': {'currentMatchupPeriod': 2},
      'settings': {'scheduleSettings': {'periodTypeId': 2, 'matchupPeriods': {'1':[1], '2':[2], '3':[3]}},
                   'rosterSettings': {'lineupLocktimeType':'INDIVIDUAL_GAME', 'lineupSlotCounts':{'0':1,'11':3,'12':5,'13':2}}},
      'schedule': [{'matchupPeriodId':3,'home':{'teamId':7},'away':{'teamId':9}}]},
      'nbaSchedule': {'settings': {'proTeams': [{'id':1,'abbrev':'ATL','proGamesByScoringPeriod':games},
                                             {'id':2,'abbrev':'BOS','proGamesByScoringPeriod':games}]}}}


def test_dates_deduplicate_games_and_map_future_opponents():
    f=forecast_schedule(fixture(),SLOTS)
    assert f['lineupDate']=='2026-10-29'
    assert f['windows']==[{'period':2,'start':'2026-10-26','end':'2026-11-01'}, {'period':3,'start':'2026-11-02','end':'2026-11-08'}]
    assert [g['id'] for g in f['games']]==['2','3']
    assert f['slots']==['PG','UTIL','UTIL','UTIL']
    assert f['pairs']==[{'period':3,'home':7,'away':9}]


def test_missing_or_unsupported_calendar_does_not_break_import():
    assert forecast_schedule({},SLOTS) is None
    for field,value in [('lineupLocktimeType','FIRSTGAME_MATCHUPPERIOD'), ('lineupSlotStatLimits', {'0':{'maximum':4}})]:
        r=fixture();r['league']['settings']['rosterSettings'][field]=value
        assert forecast_schedule(r,SLOTS) is None
    r=fixture();r['league']['settings']['scheduleSettings']['matchupPeriods']['2']=[5]
    assert forecast_schedule(r,SLOTS) is None
    r=fixture();r['league']['settings']['scheduleSettings']['matchupPeriods']['3']=[3,4]
    assert len(forecast_schedule(r,SLOTS)['windows'])==1


def test_conflicting_schedule_and_unknown_slot_fail_closed():
    r=fixture();r['nbaSchedule']['settings']['proTeams'][1]['proGamesByScoringPeriod']={'10':[{'id':2,'date':1,'homeProTeamId':1,'awayProTeamId':2,'scoringPeriodId':10}]}
    assert forecast_schedule(r,SLOTS) is None
    r=fixture();r['league']['settings']['rosterSettings']['lineupSlotCounts']['99']=1
    assert forecast_schedule(r,SLOTS) is None


def test_daily_lineups_remain_separate_from_current_ownership():
    r = fixture()
    r['league']['teams'] = [
        {'id': 7, 'roster': {'entries': [
            {'lineupSlotId': 0, 'playerPoolEntry': {'player': {'id': 100}, 'onTeamId': 9}},
            {'lineupSlotId': 12, 'playerPoolEntry': {'player': {'id': 101}, 'onTeamId': 0}},
            {'lineupSlotId': 13, 'playerPoolEntry': {'player': {'id': 102}}},
        ]}},
        {'id': 9, 'roster': {'entries': []}},
        {'id': 10},
    ]
    result = forecast_schedule(r, SLOTS)
    assert result['lineups'] == [
        {'teamId': 7, 'entries': [{'playerId': 100, 'slot': 'PG'}, {'playerId': 101, 'slot': 'BE'}, {'playerId': 102, 'slot': 'IR'}]},
        {'teamId': 9, 'entries': []},
    ]
    # Missing lineup coverage is not equivalent to an empty lineup.
    assert all(row['teamId'] != 10 for row in result['lineups'])


def test_invalid_daily_lineup_does_not_fabricate_assignments():
    r = fixture()
    entry = {'lineupSlotId': 99, 'playerPoolEntry': {'player': {'id': 100}}}
    r['league']['teams'] = [{'id': 7, 'roster': {'entries': [entry]}}]
    assert forecast_schedule(r, SLOTS)['lineups'][0]['entries'][0]['slot'] is None
    r['league']['teams'][0]['roster']['entries'].append(entry)
    assert forecast_schedule(r, SLOTS) is None
