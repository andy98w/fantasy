"""Deterministic fictional league for UI development; never passed off as ESPN data."""
import json
import random
from pathlib import Path
from .rankings import CATS, rank_players, rank_teams

def make_demo():
    rng=random.Random(9)
    names=['Kirk’s Mercs','The Pick & Rolls','Board Meeting','Paint Patrol','Sunday Streamers','The Sixth Men','Triple Threat','Full Court Press','No Easy Buckets','The Rebounders','Coast to Coast','Bench Mob']
    teams=[{'id':i+1,'name':n,'abbrev':['KM','PR','BM','PP','SS','SM','TT','FC','NE','RB','CC','BB'][i],
        'wins':max(0,18-i),'losses':i+5,'ties':i%3,'standing':i+1} for i,n in enumerate(names)]
    first=['Theo','Marcus','Evan','Isaiah','Jalen','Noah','Miles','Devin','Cole','Andre','Jordan','Camden']
    last=['Carter','Brooks','Reed','Ellis','Hayes','Porter','Bennett','Grant','Davis','Walker','Lewis','Wright']
    nba=['POR','BOS','DEN','NYK','OKC','CLE','MEM','GSW','SAC','ORL','ATL','LAL']
    players=[]
    for i in range(144):
        t=i//10+1 if i<120 else None
        fga=round(rng.uniform(6,21),1); fta=round(rng.uniform(1,9),1)
        fg=round(rng.uniform(.39,.60),3); ft=round(rng.uniform(.65,.93),3)
        threes=round(rng.uniform(.2,4.1),1)
        s={'FGM':round(fga*fg,2),'FGA':fga,'FTM':round(fta*ft,2),'FTA':fta,'FG%':fg,'FT%':ft,
           '3PM':threes,'PTS':round(2*fga*fg+threes+fta*ft,1),'REB':round(rng.uniform(2,12),1),
           'AST':round(rng.uniform(1,10),1),'STL':round(rng.uniform(.4,2),1),'BLK':round(rng.uniform(.1,2),1),
           'TO':round(rng.uniform(.8,3.5),1),'MIN':round(rng.uniform(20,36),1)}
        pos=['PG','SG','SF','PF','C'][i%5]
        players.append({'id':-(i+1),'name':f'{first[i%12]} {last[i//12]}','nbaTeam':nba[i%12],
            'position':pos,'eligibleSlots':[pos,'UTIL'],'teamId':t,'slot':('BE' if i%10>=8 else pos) if t else None,
            'status':'DAY_TO_DAY' if i%17==0 else 'OUT' if i%31==0 else 'ACTIVE',
            'availability':'ROSTERED' if t else 'FREEAGENT','gamesPlayed':8,'stats':s})
    # Match the real league's configured team ID without using private league data.
    remap=lambda i:3 if i==1 else 1 if i==3 else i
    for t in teams: t['id']=remap(t['id'])
    for p in players: p['teamId']=remap(p['teamId'])
    model=rank_players(players,144); rank_teams(teams,players)
    matchups=[]
    for i in range(6):
        a={'PTS':438+i*14,'REB':169+i*7,'AST':109+i*3,'STL':29+i,'BLK':18+i,'3PM':58+i*2,'FG%':.487,'FT%':.824,'TO':49+i}
        b={'PTS':412+i*11,'REB':182+i*6,'AST':96+i*5,'STL':34+i,'BLK':16+i,'3PM':51+i,'FG%':.501,'FT%':.791,'TO':44+i}
        matchups.append({'id':i+1,'period':3,'home':{'teamId':remap(i*2+1),'wins':5,'ties':0,'stats':a},'away':{'teamId':remap(i*2+2),'wins':4,'ties':0,'stats':b}})
    return {'schemaVersion':1,'mode':'demo','syncedAt':'2026-10-29T19:00:00+00:00',
        'league':{'id':1834203755,'season':2027,'name':'The Association','myTeamId':3,'scoringType':'H2H_CATEGORY',
        'matchupPeriod':3,'scoringPeriod':10,'categories':CATS,'rosterSlots':{'0':1,'1':1,'2':1,'3':1,'4':1,'11':3,'12':2}},
        'players':players,'teams':teams,'matchups':matchups,'news':[], 'model':model,
        'coverage':{'teamCount':12,'playerCount':144,'rosteredCount':120},
        'warnings':['Demo: all players, statistics, standings and matchups are fictional.']}

if __name__=='__main__':
    Path('lib/demo.json').write_text(json.dumps(make_demo(),indent=2)+'\n')
