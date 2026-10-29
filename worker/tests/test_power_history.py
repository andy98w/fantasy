from copy import deepcopy
from worker.power_history import add_power_history

def snapshot(time, powers=(50, 70, None), season=2027):
    return {'mode':'live','league':{'id':1,'season':season},'syncedAt':time,
            'model':{'version':'v1','basis':'per game','minimumGames':3,'poolRule':'minutes'},
            'players':[{'id':i+1,'power':p} for i,p in enumerate(powers)]}

def test_first_capture_has_no_fake_changes_and_records_daily_history():
    s=snapshot('2026-10-29T23:00:00+00:00');add_power_history(s)
    assert s['powerBaselineAt'] is None
    assert len(s['powerHistory'])==1
    assert all(p['powerChange7d'] is None for p in s['players'])

def test_seven_day_changes_new_ratings_zero_and_missing_values():
    old=snapshot('2026-10-22T23:00:00+00:00',(50,70,None,0,5));add_power_history(old)
    new=snapshot('2026-10-29T23:00:00+00:00',(62.4,61,15,0,None));add_power_history(new,old)
    assert new['powerBaselineAt']==old['syncedAt']
    assert [p['powerChange7d'] for p in new['players']]==[12.4,-9,None,0,None]
    assert [p['powerTrendStatus'] for p in new['players']]==['measured','measured','new','measured','unavailable']

def test_retention_is_bounded_and_updates_same_day_without_changing_old_baseline():
    s=None
    for day in range(10,30):
        n=snapshot(f'2026-10-{day}T23:00:00+00:00',(day,70,None));add_power_history(n,s);s=n
    assert len(s['powerHistory'])==8
    assert s['players'][0]['powerChange7d']==7
    n=snapshot('2026-10-30T01:00:00+00:00',(31,70,None));add_power_history(n,s) # still Oct 29 PT
    assert len(n['powerHistory'])==8
    assert n['powerHistory'][-1]['ratings']['1']==31
    assert n['players'][0]['powerChange7d']==9

def test_missing_target_date_is_not_replaced_with_stale_data():
    old=snapshot('2026-10-21T23:00:00+00:00');add_power_history(old)
    new=snapshot('2026-10-29T23:00:00+00:00');add_power_history(new,old)
    assert new['powerBaselineAt'] is None

def test_model_league_season_changes_and_future_data_are_not_compared():
    old=snapshot('2026-10-22T23:00:00+00:00');add_power_history(old)
    for kind in ['model','season','league','mode']:
        new=snapshot('2026-10-29T23:00:00+00:00')
        if kind=='model':new['model']['version']='v2'
        elif kind=='season':new['league']['season']=2028
        elif kind=='league':new['league']['id']=2
        else:new['mode']='demo'
        add_power_history(new,old)
        assert new['powerBaselineAt'] is None
    new=snapshot('2026-10-20T23:00:00+00:00');add_power_history(new,old)
    assert len(new['powerHistory'])==1

def test_pacific_calendar_dates_across_daylight_saving():
    old=snapshot('2026-10-29T07:30:00+00:00');add_power_history(old)
    new=snapshot('2026-11-05T08:30:00+00:00',(55,70,None));add_power_history(new,old)
    assert new['players'][0]['powerChange7d']==5
    assert new['powerHistory'][-1]['date']=='2026-11-05'
