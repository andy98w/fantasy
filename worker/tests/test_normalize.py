from copy import deepcopy
import pytest
from worker.espn import SyncError
from worker.normalize import normalize, STAT_IDS

def fixture():
    ids=['0','1','2','3','6','11','17','19','20']
    player={'id':100,'fullName':'Test Player','defaultPositionId':1,'proTeamId':2,'eligibleSlots':[0,5,11],
        'stats':[{'seasonId':2027,'statSourceId':0,'statSplitTypeId':0,'stats':{'42':5,'0':100,'13':30,'14':60,'15':20,'16':25}}]}
    return {'league':{'settings':{'name':'Test','scoringSettings':{'scoringType':'H2H_CATEGORY','scoringItems':[{'statId':int(i)} for i in ids]}},
        'status':{'currentMatchupPeriod':2},'scoringPeriodId':7,'teams':[{'id':3,'name':'Mine','roster':{'entries':[{'lineupSlotId':0,'playerPoolEntry':{'player':player}}]}},{'id':4,'name':'Theirs','roster':{'entries':[]}}]},
        'players':[{'player':player,'onTeamId':3}],
        'scores':{'schedule':[{'id':5,'matchupPeriodId':2,'home':{'teamId':3,'cumulativeScore':{'wins':5,'ties':0,'scoreByStat':{'0':{'score':100,'result':'WIN'},'19':{'score':.5,'result':'LOSS'}}}},'away':{'teamId':4,'cumulativeScore':{'wins':4,'ties':0,'scoreByStat':{}}}}]}}

def test_actual_season_stats_positions_and_category_totals():
    data=normalize(fixture(),123,2027,3)
    p=data['players'][0]
    assert p['stats']['PTS']==20
    assert p['stats']['FG%']==.5
    assert p['stats']['FT%']==.8
    assert p['position']=='PG' and p['slot']=='PG'
    assert 'STL' not in p['stats'] and p['power'] is None
    assert data['matchups'][0]['home']['stats']['PTS']==100
    assert data['matchups'][0]['home']['wins']==5

def test_points_league_rejected():
    raw=fixture();raw['league']['settings']['scoringSettings']['scoringType']='H2H_POINTS'
    with pytest.raises(SyncError,match='category league'):normalize(raw,123,2027,3)

def test_missing_roster_player_rejected():
    raw=fixture();raw['players']=[]
    with pytest.raises(SyncError,match='omitted rostered'):normalize(raw,123,2027,3)

def test_traded_player_uses_current_owner_without_old_lineup_slot():
    raw=fixture();raw['players'][0]['onTeamId']=4
    data=normalize(raw,123,2027,3)
    assert data['players'][0]['teamId']==4
    assert data['players'][0]['slot'] is None
    assert data['players'][0]['availability']=='ROSTERED'

def test_same_day_add_drop_preserves_matchup_but_updates_current_roster():
    raw=fixture()
    added=deepcopy(raw['players'][0])
    added['player'].update(id=101,fullName='New Pickup')
    added['status']='ONTEAM'
    raw['players'][0].update(onTeamId=0,status='WAIVERS')
    raw['players'].append(added)
    data=normalize(raw,123,2027,3)
    dropped,pickup=data['players']
    assert (dropped['teamId'],dropped['slot'],dropped['availability'])==(None,None,'WAIVERS')
    assert (pickup['teamId'],pickup['slot'],pickup['availability'])==(3,None,'ROSTERED')
    assert data['coverage']['rosteredCount']==1
    assert data['matchups'][0]['home']['stats']['PTS']==100

def test_new_owned_player_counts_toward_coverage_without_daily_lineup_entry():
    raw=fixture()
    added=deepcopy(raw['players'][0]);added['player']['id']=101
    raw['players'].append(added)
    assert normalize(raw,123,2027,3)['coverage']['rosteredCount']==2

@pytest.mark.parametrize('owner',[999,-1,'3',True])
def test_invalid_ownership_rejected(owner):
    raw=fixture();raw['players'][0]['onTeamId']=owner
    with pytest.raises(SyncError,match='unknown league team'):normalize(raw,123,2027,3)

def test_missing_ownership_keeps_daily_roster_fallback():
    raw=fixture();del raw['players'][0]['onTeamId']
    player=normalize(raw,123,2027,3)['players'][0]
    assert (player['teamId'],player['slot'])==(3,'PG')

def test_unrecognized_ninth_category_rejected():
    raw=fixture();raw['league']['settings']['scoringSettings']['scoringItems'][-1]['statId']=38
    with pytest.raises(SyncError,match='standard 9-cat'):normalize(raw,123,2027,3)

@pytest.mark.parametrize('logo, expected', [
    ('https://g.espncdn.com/team.svg', 'https://g.espncdn.com/team.svg'),
    ('https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/example', 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/example'),
    (None, None), ('javascript:alert(1)', None), ('https://user:secret@example.com/logo.png', None),
])
def test_team_logos_pass_through_without_unsafe_urls(logo, expected):
    raw = fixture()
    raw['league']['teams'][0]['logo'] = logo
    data = normalize(raw, 123, 2027, 3)
    assert data['teams'][0]['logoUrl'] == expected
    assert data['teams'][1]['logoUrl'] is None
