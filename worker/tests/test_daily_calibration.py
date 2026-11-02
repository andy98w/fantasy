from copy import deepcopy
import json
from pathlib import Path
import pytest
from worker.daily_calibration import calibrate, box_lines, load_calibration


def fixture():
    def stats(n):
        return dict(PTS=n,REB=n,AST=n,STL=n,BLK=n,TO=n,FGM=n/2,FGA=n,FTM=n/2,FTA=n,**{'3PM':n})
    s = {'syncedAt':'2026-11-02T20:00:00+00:00','league':{'season':2027},'model':{'poolIds':[1,2],'minimumGames':3},
         'players':[{'id':i,'gamesPlayed':6,'stats':stats(i*2)} for i in [1,2]]}
    games = [{'id':str(day),'date':f'2026-10-{20+day}',
              'lines':[{'playerId':1,'stats':{**stats(3),'PTS':(day*40+i)/100}} for i in range(40)]} for day in range(8)]
    return s,games


def test_calibration_empirical_quantile_and_deduplication():
    s,games = fixture()
    result = calibrate(s,games+[games[0]],'2026-10-20','2026-10-31')
    assert result['sampleSize'] == 320 and result['dayCount'] == 8 and result['gameCount'] == 8
    assert result['cutoff'] == pytest.approx(-2.681)
    assert result['to'] == '2026-10-31'
    # Later games and players outside the reference pool cannot move the cutoff.
    outside = deepcopy(games[0]); outside['id']='future';outside['date']='2026-11-01'
    assert calibrate(s,games+[outside],'2026-10-20','2026-10-31') == result
    other = deepcopy(games[0]['lines'][0]); other['playerId']=999
    games[0]['lines'].append(other)
    assert calibrate(s,games,'2026-10-20','2026-10-31') == result


def test_insufficient_history_and_nonnegative_cutoff():
    s,games=fixture()
    assert calibrate(s,games[:6],'2026-10-20','2026-10-31') is None
    for game in games:
        for row in game['lines']: row['stats']['PTS']=50
    assert calibrate(s,games,'2026-10-20','2026-10-31')['cutoff'] == 0


def test_box_lines_match_stat_keys_exclude_short_appearances_and_reject_bad_data():
    payload=json.loads(Path('tests/fixtures/nba-boxscore.json').read_text())
    lines=box_lines(payload,payload['header']['id'])
    assert lines and all('FTA' in p['stats'] for p in lines)
    with pytest.raises(ValueError): box_lines(payload,'wrong')
    for group in payload['boxscore']['players'][0]['statistics']:
        index=group['keys'].index('minutes')
        for row in group['athletes']: row['stats'][index]='9:59'
    remaining=box_lines(payload,payload['header']['id'])
    assert len(remaining) < len(lines)


def test_cached_sample_is_rescored_without_network_and_stale_failed_fetch_is_not_published(tmp_path):
    s,games=fixture(); path=tmp_path/'cache.json'
    path.write_text(json.dumps({'season':2027,'through':'2026-10-31','games':games}))
    def fail(_): raise RuntimeError('offline')
    assert load_calibration(s,path,fail)['sampleSize'] == 320
    s['syncedAt']='2026-11-03T20:00:00+00:00'
    with pytest.raises(RuntimeError): load_calibration(s,path,fail)
    assert json.loads(path.read_text())['through'] == '2026-10-31'


def test_cold_fetch_deduplicates_games_and_excludes_preseason_unfinished_and_target_slate(tmp_path):
    s,_=fixture();box=json.loads(Path('tests/fixtures/nba-boxscore.json').read_text());gid=box['header']['id']
    event={'id':gid,'date':'2026-10-29T01:00:00Z','season':{'year':2027,'type':2},'status':{'type':{'completed':True}}}
    preseason={**event,'id':'pre','season':{'year':2027,'type':1}}
    future={**event,'id':'future','date':'2026-11-02T01:00:00Z'}
    unfinished={**event,'id':'live','status':{'type':{'completed':False}}}
    calls=[]
    def request(url):
        calls.append(url)
        return {'events':[event,preseason,future,unfinished]} if 'scoreboard?' in url else box
    path=tmp_path/'cache.json'
    assert load_calibration(s,path,request) is None # one real game cannot qualify as calibration
    assert sum('summary?' in url for url in calls)==1
    cache=json.loads(path.read_text())
    assert len(cache['games'])==1 and cache['games'][0]['id']==gid
