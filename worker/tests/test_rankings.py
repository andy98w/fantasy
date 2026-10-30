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

def test_partial_roster_has_provisional_total_and_explicit_coverage():
    players=[player(1),player(2,PTS=20),player(3)]
    players[2]['gamesPlayed']=0
    rank_players(players,3)
    teams=[{'id':1}]; rank_teams(teams,players)
    assert teams[0]['talent'] == round(sum(p['zTotal'] for p in players if p['zTotal'] is not None), 3)
    assert players[2]['zTotal'] is None
    assert teams[0]['rankedPlayers']==2


def test_equal_player_values_share_competition_ranks():
    players=[player(1,PTS=25),player(2,PTS=25),player(3,PTS=10)]
    rank_players(players,3)
    assert [p['rank'] for p in players] == [1,1,3]
    assert players[0]['power'] == players[1]['power']


def test_team_ties_and_no_measured_players():
    players=[player(1),player(2),player(3,PTS=10)]
    players[0]['teamId']=1
    players[1]['teamId']=2
    players[2]['teamId']=3
    rank_players(players,3)
    teams=[{'id':1},{'id':2},{'id':3},{'id':4}]
    rank_teams(teams,players)
    assert [t['talentRank'] for t in teams] == [1,1,3,None]
    assert teams[3]['talent'] is None


def test_ir_does_not_contribute_to_team_power_categories_or_coverage():
    players=[
        {'id':1,'teamId':1,'slot':'BE','status':'OUT','zTotal':2,'contributions':{'AST':2}},
        {'id':2,'teamId':1,'slot':'IR','zTotal':10,'contributions':{'AST':10}},
        {'id':3,'teamId':1,'slot':'IR','zTotal':-5,'contributions':{'AST':-5}},
        {'id':4,'teamId':1,'slot':'IR','zTotal':None,'contributions':{}},
        {'id':5,'teamId':2,'slot':'IR','zTotal':20,'contributions':{'AST':20}},
    ]
    teams=[{'id':1},{'id':2}]
    rank_teams(teams,players)
    assert teams[0]['talent']==2
    assert teams[0]['categoryProfile']['AST']==2
    assert teams[0]['rankedPlayers']==teams[0]['rosterSize']==1
    assert teams[1]['talent'] is None and teams[1]['talentRank'] is None
    assert players[1]['zTotal']==10
    players[1]['slot']='BE'
    rank_teams(teams,players)
    assert teams[0]['talent']==12
