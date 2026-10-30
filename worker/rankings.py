"""Transparent per-game 9-cat z-scores; not forecasts or win probabilities."""
from __future__ import annotations
from statistics import mean, pstdev
import math

CATS = ['PTS','REB','AST','STL','BLK','3PM','FG%','FT%','TO']
REQUIRED = ['PTS','REB','AST','STL','BLK','3PM','TO','FGM','FGA','FTM','FTA']

def rank_players(players: list[dict], pool_size: int) -> dict:
    eligible = [p for p in players if p.get('gamesPlayed',0) >= 3
                and all(isinstance(p['stats'].get(k),(int,float)) and math.isfinite(p['stats'][k]) for k in REQUIRED)]
    # Fixed pool for the snapshot, independent of UI filters. Most minutes first.
    pool = sorted(eligible,key=lambda p:(-p['stats'].get('MIN',0),p['id']))[:pool_size]
    metadata = {'version':'zscore-v2','basis':'Season per game', 'poolSize':len(pool),
                'minimumGames':3, 'poolRule':'Highest minutes per game among complete players with 3+ games',
                'poolIds':[p['id'] for p in pool]}
    for p in players:
        p.update({'power':None,'zTotal':None,'contributions':{},'rank':None})
    if len(pool) < 2: return metadata
    fga=sum(p['stats']['FGA'] for p in pool)
    fta=sum(p['stats']['FTA'] for p in pool)
    if not fga or not fta: return metadata
    fg=sum(p['stats']['FGM'] for p in pool)/fga
    ft=sum(p['stats']['FTM'] for p in pool)/fta
    def vector(p):
        s=p['stats']
        return {**{k:s[k] for k in CATS if '%' not in k},
                'FG%':s['FGM']-fg*s['FGA'], 'FT%':s['FTM']-ft*s['FTA']}
    vectors=[vector(p) for p in pool]
    means={c:mean(v[c] for v in vectors) for c in CATS}
    stds={c:pstdev(v[c] for v in vectors) for c in CATS}
    for p in eligible:
        v=vector(p)
        z={c:((v[c]-means[c])/stds[c] if stds[c]>1e-12 else 0)*(-1 if c=='TO' else 1) for c in CATS}
        p['contributions']={k:round(val,3) for k,val in z.items()}
        p['zTotal']=round(sum(p['contributions'].values()),3)
    reference=sorted(p['zTotal'] for p in pool)
    for p in eligible:
        # Empirical midrank percentile of the declared reference pool, not a probability.
        p['power']=round(100*(sum(v<p['zTotal'] for v in reference)+0.5*sum(v==p['zTotal'] for v in reference))/len(reference),1)
    ordered=sorted(eligible,key=lambda p:(-p['zTotal'],p['id']))
    previous = None
    rank = 0
    for i,p in enumerate(ordered,1):
        if p['zTotal'] != previous: rank = i
        p['rank']=rank
        previous = p['zTotal']
    return metadata

def rank_teams(teams, players):
    for t in teams:
        roster=[p for p in players if p.get('teamId')==t['id'] and p.get('slot')!='IR']
        ranked=[p for p in roster if p.get('zTotal') is not None]
        t['rankedPlayers']=len(ranked)
        t['rosterSize']=len(roster)
        # Provisional estimate: each unrated slot uses reference-average category
        # value (zero z-score). Keep coverage explicit; never rate unknown players.
        t['talent']=round(sum(p['zTotal'] for p in ranked),3) if ranked else None
        t['categoryProfile']={c:round(sum(p['contributions'].get(c,0) for p in ranked),3) for c in CATS}
    ranked=sorted([t for t in teams if t['talent'] is not None],key=lambda t:(-t['talent'],t['id']))
    for t in teams: t['talentRank']=None
    previous = None
    rank = 0
    for i,t in enumerate(ranked,1):
        if t['talent'] != previous: rank = i
        t['talentRank']=rank
        previous = t['talent']
