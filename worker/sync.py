"""One-shot worker: uv run python -m worker.sync [--probe | --news-only]."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import tempfile
import sys
from dotenv import load_dotenv
import psycopg
from psycopg.types.json import Jsonb
from .espn import ESPNClient, SyncError
from .normalize import normalize
from .news import collect_news

ROOT=Path(__file__).resolve().parents[1]

def atomic_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as f:
        try:
            json.dump(value,f,allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
            os.chmod(f.name,0o600)
            os.replace(f.name,path)
        finally:
            if os.path.exists(f.name): os.unlink(f.name)

@contextmanager
def local_lock(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    with open(path,'a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise SyncError('A sync is already running.') from None
        yield

def run(args):
    load_dotenv(ROOT/'.env')
    league_id=int(os.environ.get('ESPN_LEAGUE_ID','1834203755'))
    season=int(os.environ.get('ESPN_SEASON','2027'))
    team_id=int(os.environ.get('ESPN_TEAM_ID','3'))
    path=Path(os.environ.get('SNAPSHOT_PATH','data/league.json'))
    if not path.is_absolute(): path=ROOT/path
    db_url=os.environ.get('DATABASE_URL')
    connection=None
    if args.probe:
        with ESPNClient(league_id,season,os.environ.get('ESPN_S2',''),os.environ.get('ESPN_SWID','')) as client:
            payload=client.get(client.league,{'view':'mSettings'})
            print(json.dumps({'accessible':True,'leagueId':league_id,'season':season,
                              'scoringType':payload.get('settings',{}).get('scoringSettings',{}).get('scoringType')}))
        return
    with local_lock(path.parent/'sync.lock'):
        try:
            if db_url:
                connection=psycopg.connect(db_url,autocommit=True,connect_timeout=10)
                if not connection.execute('SELECT pg_try_advisory_lock(%s, %s)',(league_id,season)).fetchone()[0]:
                    raise SyncError('A database sync is already running.')
                connection.execute((ROOT/'db/schema.sql').read_text())
                row=connection.execute('SELECT payload FROM league_snapshots WHERE league_id=%s AND season=%s ORDER BY captured_at DESC,id DESC LIMIT 1',(league_id,season)).fetchone()
                previous=row[0] if row else None
            else:
                previous=json.loads(path.read_text()) if path.exists() else None
            if args.news_only:
                if not previous: raise SyncError('Import the league before running a news-only sync.')
                snapshot=previous
                raw={}
            else:
                with ESPNClient(league_id,season,os.environ.get('ESPN_S2',''),os.environ.get('ESPN_SWID','')) as client:
                    raw=client.fetch()
                snapshot=normalize(raw,league_id,season,team_id)
            snapshot['news'],news_warnings=collect_news(snapshot['players'],(previous or {}).get('news'))
            snapshot['warnings']=[w for w in snapshot.get('warnings',[]) if 'news unavailable' not in w]+news_warnings
            snapshot['newsSyncedAt']=datetime.now(timezone.utc).isoformat()
            message=f"Imported {len(snapshot['teams'])} teams, {len(snapshot['players'])} players, {len(snapshot['matchups'])} matchups."
            if connection:
                with connection.transaction():
                    connection.execute('INSERT INTO league_snapshots (league_id,season,payload,raw_payload) VALUES (%s,%s,%s,%s)',(league_id,season,Jsonb(snapshot),Jsonb(raw)))
                    connection.execute('INSERT INTO sync_runs (league_id,season,succeeded,message) VALUES (%s,%s,true,%s)',(league_id,season,message))
            else:
                if raw: atomic_json(path.parent/'raw-latest.json',raw)
                atomic_json(path,snapshot)
                atomic_json(path.parent/'sync-status.json',{'succeeded':True,'message':message,'finishedAt':datetime.now(timezone.utc).isoformat()})
            print(message)
        except Exception as error:
            message=str(error) if isinstance(error,SyncError) else 'Sync failed during validation or storage. Last successful snapshot was preserved.'
            if connection:
                try: connection.execute('INSERT INTO sync_runs (league_id,season,succeeded,message) VALUES (%s,%s,false,%s)',(league_id,season,message))
                except psycopg.Error: pass
            else:
                atomic_json(path.parent/'sync-status.json',{'succeeded':False,'message':message,'finishedAt':datetime.now(timezone.utc).isoformat()})
            raise SyncError(message) from None
        finally:
            if connection: connection.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group()
    group.add_argument('--probe',action='store_true')
    group.add_argument('--news-only',action='store_true')
    try: run(parser.parse_args())
    except (SyncError,ValueError) as error:
        print(str(error) if isinstance(error,SyncError) else 'Invalid numeric league, season or team configuration.',file=sys.stderr)
        raise SystemExit(1)

if __name__=='__main__': main()
