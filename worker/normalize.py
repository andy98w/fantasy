from __future__ import annotations
from datetime import datetime, timezone
from urllib.parse import urlsplit
from .espn import SyncError
from .rankings import rank_players, rank_teams, CATS
from .weekly import weekly_players

STAT_IDS={'0':'PTS','1':'BLK','2':'STL','3':'AST','6':'REB','11':'TO','13':'FGM','14':'FGA','15':'FTM','16':'FTA','17':'3PM','19':'FG%','20':'FT%','40':'MIN','42':'GP'}
SLOTS={0:'PG',1:'SG',2:'SF',3:'PF',4:'C',5:'G',6:'F',7:'SG/SF',8:'G/F',9:'PF/C',10:'F/C',11:'UTIL',12:'BE',13:'IR',15:'Rookie'}
NBA=['FA','ATL','BOS','NOP','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MIA','MIL','MIN','BKN','NYK','ORL','PHI','PHX','POR','SAC','SAS','OKC','UTA','WAS','TOR','MEM','CHA']

def team_logo(value):
    if not isinstance(value, str): return None
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:
        return None

def normalize_matchup(m, season, include_players=True):
    def side(s):
        cumulative=s.get('cumulativeScore') or {}
        stats={STAT_IDS.get(str(k),str(k)):v.get('score') for k,v in (cumulative.get('scoreByStat') or {}).items()}
        performers, complete = weekly_players(s, season) if include_players else ([], False)
        return {'teamId':s['teamId'],'wins':cumulative.get('wins'),
                'ties':cumulative.get('ties'),'stats':stats,'performers':performers,'performanceComplete':complete}
    winner=m.get('winner','UNDECIDED')
    return {'id':m['id'],'period':m['matchupPeriodId'],'home':side(m['home']),'away':side(m['away']),
            'result':winner if winner in ('HOME','AWAY','TIE') else 'UNDECIDED'}

def normalize(raw, league_id, season, team_id):
    league=raw['league']
    settings=league['settings']
    scoring=settings.get('scoringSettings',{})
    scoring_type=scoring.get('scoringType')
    if scoring_type not in ('H2H_CATEGORY','H2H_MOST_CATEGORIES'):
        raise SyncError('This release requires an ESPN head-to-head category league.')
    categories=[STAT_IDS.get(str(x['statId']),str(x['statId'])) for x in scoring.get('scoringItems',[])]
    if set(categories)!=set(CATS):
        raise SyncError('League categories differ from standard 9-cat; import stopped to avoid incorrect rankings.')
    teams=[]
    roster_map={}
    for t in league['teams']:
        record=t.get('record',{}).get('overall',{})
        teams.append({'id':t['id'],'name':t.get('name') or f"{t.get('location','')} {t.get('nickname','')}".strip() or f"Team {t['id']}",
            'abbrev':t.get('abbrev',''), 'logoUrl':team_logo(t.get('logo')), 'wins':record.get('wins',0),'losses':record.get('losses',0),
            'ties':record.get('ties',0),'standing':t.get('playoffSeed') or t.get('rankCalculatedFinal') or None})
        for entry in t.get('roster',{}).get('entries',[]):
            p=entry.get('playerPoolEntry',{}).get('player',{})
            if not p.get('id'): raise SyncError('Roster entry is missing a player ID.')
            if p['id'] in roster_map: raise SyncError('A player appears on more than one roster.')
            roster_map[p['id']]={'teamId':t['id'],'slot':SLOTS.get(entry.get('lineupSlotId'),'—')}
    team_ids={t['id'] for t in teams}
    if team_id not in team_ids: raise SyncError('Configured team ID was not found in the league.')
    players=[]
    entries={e.get('player',{}).get('id',e.get('id')):e for e in raw['players']}
    # An omitted roster player is a coverage failure, not silently repaired from another endpoint.
    if set(roster_map)-set(entries): raise SyncError('Full player pool omitted rostered players; import stopped.')
    for pid,e in entries.items():
        p=e.get('player',e)
        splits=p.get('stats',[])
        actual=next((s for s in splits if s.get('seasonId')==season and s.get('statSourceId')==0 and s.get('statSplitTypeId')==0),None)
        totals=actual.get('stats',{}) if actual else {}
        gp=totals.get('42',0)
        averages=actual.get('averageStats') if actual else None
        # Missing stats stay missing. Actual zero values are retained.
        stats={}
        for sid,name in STAT_IDS.items():
            if name=='GP': continue
            if averages and sid in averages: stats[name]=averages[sid]
            elif sid in totals and gp: stats[name]=totals[sid] if '%' in name else totals[sid]/gp
        for makes,attempts,rate in [('FGM','FGA','FG%'),('FTM','FTA','FT%')]:
            if makes in stats and attempts in stats:
                stats[rate]=stats[makes]/stats[attempts] if stats[attempts] else None
        nba=p.get('proTeamId',0)
        roster=roster_map.get(pid,{'teamId':None,'slot':None})
        # mRoster describes the day's lineup, which can stay locked after an
        # add/drop or trade. The player pool reports current ownership. Keep a
        # lineup slot only when it belongs to that same current owner.
        ownership=e.get('onTeamId')
        if ownership is not None:
            if type(ownership) is not int or (ownership != 0 and ownership not in team_ids):
                raise SyncError('Player ownership references an unknown league team.')
            current_team=ownership or None
            if current_team != roster['teamId']:
                roster={'teamId':current_team,'slot':None}
        players.append({'id':pid,'name':p.get('fullName',f'Player {pid}'),
            'nbaTeam':NBA[nba] if 0<=nba<len(NBA) else str(nba),
            'position':SLOTS.get(p.get('defaultPositionId',0)-1,'—'),
            'eligibleSlots':[SLOTS.get(s,str(s)) for s in p.get('eligibleSlots',[])],
            **roster,'status':p.get('injuryStatus','UNKNOWN'),
            'availability':'ROSTERED' if roster['teamId'] is not None else e.get('status','UNKNOWN'),
            'gamesPlayed':gp,'stats':stats})
    matchups=[]
    for m in raw['scores'].get('schedule',[]):
        if m.get('matchupPeriodId') != league['status']['currentMatchupPeriod']: continue
        if not m.get('home') or not m.get('away'): continue # bye
        matchups.append(normalize_matchup(m,season))
    slot_counts=settings.get('rosterSettings',{}).get('lineupSlotCounts',{})
    roster_size=sum(v for k,v in slot_counts.items() if str(k)!='13') or 13
    model=rank_players(players,len(teams)*roster_size+24)
    rank_teams(teams,players)
    return {'schemaVersion':1,'mode':'live','syncedAt':datetime.now(timezone.utc).isoformat(),
        'league':{'id':league_id,'season':season,'name':settings.get('name','Fantasy league'),
        'myTeamId':team_id,'scoringType':scoring_type,'matchupPeriod':league['status']['currentMatchupPeriod'],
        'scoringPeriod':league['scoringPeriodId'],'categories':CATS,'rosterSlots':slot_counts},
        'teams':teams,'players':players,'matchups':matchups,'news':[], 'model':model,
        'coverage':{'playerCount':len(players),'rosteredCount':sum(p['teamId'] is not None for p in players),'teamCount':len(teams)},
        'warnings':['Weekly projections are not available in this release.']}
