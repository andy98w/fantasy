from copy import deepcopy
from worker.demo import make_demo
from worker.rankings import rank_players, rank_teams

def player(pid, **overrides):
    stats={'PTS':15,'REB':5,'AST':4,'STL':1,'BLK':.5,'3PM':2,'TO':2,'FGM':5,'FGA':10,'FTM':3,'FTA':4,'MIN':28}
    stats.update(overrides)
    return {'id':pid,'stats':stats,'gamesPlayed':10,'teamId':1}

def test_percentage_volume_and_turnover_direction():
    players=[player(1,FGM=6,FGA=10,TO=1),player(2,FGM=12,FGA=20,TO=3),player(3,FGM=3,FGA=10,TO=2)]
    rank_players(players,3)
    assert players[1]['contributions']['FG%']>players[0]['contributions']['FG%']>players[2]['contributions']['FG%']
    assert players[0]['contributions']['TO']>players[2]['contributions']['TO']>players[1]['contributions']['TO']

def test_missing_data_and_small_samples_never_become_zero_value_players():
    players=[player(1),player(2,PTS=22),player(3),player(4)]
    players[2]['gamesPlayed']=2
    del players[3]['stats']['FTA']
    rank_players(players,10)
    assert players[2]['power'] is None and players[3]['power'] is None
    assert players[0]['power'] is not None

def test_zero_attempts_are_valid_no_nan():
    players=[player(1,FTM=0,FTA=0),player(2,FTM=4,FTA=5),player(3,FTM=2,FTA=4)]
    rank_players(players,3)
    assert all(p['power'] is not None for p in players)
    assert all(p['contributions']['PTS']==0 for p in players) # zero variance

def test_fixed_reference_pool_does_not_depend_on_display_order():
    data=make_demo(); players=data['players']; a=deepcopy(players); b=list(reversed(deepcopy(players)))
    ma=rank_players(a,50); mb=rank_players(b,50)
    assert ma['poolIds']==mb['poolIds']
    assert {p['id']:p['power'] for p in a}=={p['id']:p['power'] for p in b}

def test_partial_roster_has_no_comparable_team_talent():
    players=[player(1),player(2,PTS=20),player(3)]
    players[2]['gamesPlayed']=0
    rank_players(players,3)
    teams=[{'id':1}]; rank_teams(teams,players)
    assert teams[0]['talent'] is None
    assert teams[0]['rankedPlayers']==2
