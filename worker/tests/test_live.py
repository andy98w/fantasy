import copy
from threading import Event
import pytest
from worker.live import normalize_live
from worker.espn import SyncError
from worker import live

def inputs():
    stats={str(k):{'score':v} for k,v in [(0,20),(6,10),(3,4),(2,2),(1,1),(17,3),(19,.5),(20,.8),(11,2)]}
    m={'id':7,'matchupPeriodId':2,'home':{'teamId':1,'cumulativeScore':{'wins':5,'scoreByStat':stats}},'away':{'teamId':2,'cumulativeScore':{'wins':4,'scoreByStat':stats}}}
    s={'league':{'id':123,'season':2027,'matchupPeriod':2},'matchups':[{'id':7,'home':{'teamId':1},'away':{'teamId':2}}]}
    return {'schedule':[m]},s

def test_live_rejects_partial_wrong_period_and_wrong_teams():
    p,s=inputs()
    assert normalize_live(p,s)['matchups'][0]['home']['wins']==5
    for field,value in [('id',8),('matchupPeriodId',3)]:
        bad=copy.deepcopy(p);bad['schedule'][0][field]=value
        with pytest.raises(SyncError):normalize_live(bad,s)
    bad=copy.deepcopy(p);bad['schedule'][0]['home']['teamId']=99
    with pytest.raises(SyncError):normalize_live(bad,s)
    bad=copy.deepcopy(p);del bad['schedule'][0]['home']['cumulativeScore']['scoreByStat']['0']
    with pytest.raises(SyncError):normalize_live(bad,s)
    with pytest.raises(SyncError):normalize_live({'schedule':[]},s)

def test_continuous_loop_keeps_live_refresh_after_full_import_failure(monkeypatch,capsys):
    stopped=Event();calls=[]
    def fail(_):raise RuntimeError('private credential')
    def refresh():calls.append(1);stopped.set()
    monkeypatch.setattr(live,'run',fail)
    monkeypatch.setattr(live,'games_active',lambda:True)
    monkeypatch.setattr(live,'refresh_scores',refresh)
    live.watch(stopped)
    assert calls==[1]
    assert 'private' not in capsys.readouterr().err
