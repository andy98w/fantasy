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

def test_ownership_mismatch_rejected():
    raw=fixture();raw['players'][0]['onTeamId']=4
    with pytest.raises(SyncError,match='ownership'):normalize(raw,123,2027,3)

def test_unrecognized_ninth_category_rejected():
    raw=fixture();raw['league']['settings']['scoringSettings']['scoringItems'][-1]['statId']=38
    with pytest.raises(SyncError,match='standard 9-cat'):normalize(raw,123,2027,3)
