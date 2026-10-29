import pytest
from worker.history import fetch_history, previous_history
from worker.espn import SyncError
from worker.normalize import STAT_IDS
from worker.rankings import CATS

class Client:
    league='example'
    season=2027
    def __init__(self, games): self.games=games; self.calls=[]
    def get(self, url, params, filters):
        self.calls.append(filters['schedule']['filterMatchupPeriodIds']['value'])
        return {'schedule':self.games}

def game(winner='HOME'):
    def side(id):
        return {'teamId':id,'cumulativeScore':{'wins':5,'ties':0,'scoreByStat':{k:{'score':1} for k,v in STAT_IDS.items() if v in CATS}}}
    return {'id':1,'matchupPeriodId':1,'winner':winner,'home':side(1),'away':side(2)}

def test_only_completed_matchups_are_imported_without_player_rosters():
    league={'status':{'currentMatchupPeriod':2},'schedule':[game()]}
    client=Client([game()])
    result=fetch_history(client,league)
    assert len(result)==1 and result[0]['result']=='HOME'
    assert result[0]['home']['performers']==[]
    assert client.calls==[[1]]
    assert fetch_history(Client([game('UNDECIDED')]),{'status':{'currentMatchupPeriod':2}})==[]

def test_null_unplayed_stats_are_not_fabricated():
    g=game('UNDECIDED');g['home']['cumulativeScore']['scoreByStat']=None
    assert fetch_history(Client([g]),{'status':{'currentMatchupPeriod':2}})==[]
    g['winner']='HOME'
    with pytest.raises(SyncError,match='missing category'): fetch_history(Client([g]),{'status':{'currentMatchupPeriod':2}})

def test_missing_or_duplicate_completed_games_fail_safely():
    league={'status':{'currentMatchupPeriod':2},'schedule':[game()]}
    with pytest.raises(SyncError,match='missing from history'):fetch_history(Client([]),league)
    with pytest.raises(SyncError,match='duplicate'):fetch_history(Client([game(),game()]),league)

def test_fallback_stays_in_same_season_and_keeps_last_completed_current_week():
    previous={'league':{'id':1,'season':2027},'matchupHistory':[], 'matchups':[{'id':1,'period':1,'result':'HOME'}]}
    assert len(previous_history(previous,1,2027))==1
    assert previous_history(previous,1,2026)==[]
    assert previous_history(previous,2,2027)==[]
