"""Run explicitly against TEST_DATABASE_URL; creates and removes only a unique test schema."""
from argparse import Namespace
from copy import deepcopy
import json
import os
from pathlib import Path
from uuid import uuid4
import psycopg
from psycopg import sql
import pytest
from worker import sync
from worker.espn import SyncError


def test_sync_commit_failure_preserves_last_snapshot(monkeypatch, tmp_path):
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL not configured')
    real_connect = psycopg.connect
    schema = 'test_' + uuid4().hex
    with real_connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        try:
            def connect(*args, **kwargs):
                kwargs['options'] = kwargs.get('options', '') + f' -c search_path={schema}'
                return real_connect(*args, **kwargs)
            monkeypatch.setattr(sync.psycopg, 'connect', connect)
            monkeypatch.setattr(sync, 'load_dotenv', lambda *args: None)
            monkeypatch.setenv('DATABASE_URL', url)
            monkeypatch.setenv('REQUIRE_DATABASE', '1')
            monkeypatch.setenv('ESPN_LEAGUE_ID', '1834203755')
            monkeypatch.setenv('ESPN_SEASON', '2027')
            monkeypatch.setenv('SNAPSHOT_PATH', str(tmp_path/'league.json'))
            class Client:
                def __init__(self, *args): pass
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def fetch(self): return {'league': {}, 'fixture': True}
            snapshot = json.loads(Path('lib/demo.json').read_text())
            snapshot['mode'] = 'live'
            monkeypatch.setattr(sync, 'ESPNClient', Client)
            monkeypatch.setattr(sync, 'normalize', lambda *args: deepcopy(snapshot))
            monkeypatch.setattr(sync, 'fetch_history', lambda *args: [])
            monkeypatch.setattr(sync, 'fetch_trades', lambda *args: [])
            monkeypatch.setattr(sync, 'cache_team_logos', lambda *args: [])
            monkeypatch.setattr(sync, 'collect_news', lambda *args: ([], []))
            args = Namespace(probe=False, news_only=False)
            sync.run(args)
            with connect(url, autocommit=True) as db:
                saved = db.execute('SELECT payload FROM league_snapshots').fetchone()[0]
                assert len(saved['powerHistory']) == 1
                assert db.execute('SELECT succeeded FROM sync_runs').fetchone()[0] is True
                # Force failure after snapshot INSERT to exercise the actual transaction boundary.
                db.execute("ALTER TABLE sync_runs ADD CONSTRAINT reject_success CHECK (NOT succeeded) NOT VALID")
                with pytest.raises(SyncError, match='Last successful snapshot was preserved'):
                    sync.run(args)
                assert db.execute('SELECT count(*) FROM league_snapshots').fetchone()[0] == 1
                assert db.execute('SELECT payload FROM league_snapshots').fetchone()[0] == saved
                assert db.execute('SELECT succeeded FROM sync_runs ORDER BY id DESC LIMIT 1').fetchone()[0] is False
            assert not (tmp_path/'league.json').exists()
        finally:
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_retention_preserves_recent_daily_other_leagues_and_votes():
    from worker.retention import prune_snapshots
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL not configured')
    schema = 'test_' + uuid4().hex
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        try:
            with psycopg.connect(url, autocommit=True, options=f'-c search_path={schema}') as db:
                db.execute(Path('db/schema.sql').read_text())
                db.execute('''INSERT INTO league_snapshots(league_id,season,captured_at,payload,raw_payload)
                    SELECT 1,2027,now()-make_interval(mins => n*5),'{}','{"raw":true}'
                    FROM generate_series(0,29) n''')
                db.execute('''INSERT INTO league_snapshots(league_id,season,captured_at,payload,raw_payload)
                    SELECT 1,2027,now()-make_interval(days => n),'{}','{"raw":true}'
                    FROM generate_series(1,40) n''')
                db.execute("INSERT INTO league_snapshots(league_id,season,payload,raw_payload) VALUES(2,2027,'{}','{\"raw\":true}')")
                db.execute("INSERT INTO battle_ratings(scope,mode,entry_id) VALUES('live:1:2027','best','a:1')")
                db.execute("INSERT INTO sync_runs(league_id,season,succeeded,message,finished_at) VALUES(1,2027,true,'old',now()-interval '40 days'),(1,2027,true,'latest',now())")
                with db.transaction(): prune_snapshots(db,1,2027,30)
                count = db.execute('SELECT count(*) FROM league_snapshots WHERE league_id=1').fetchone()[0]
                assert 53 <= count <= 54
                assert db.execute("SELECT count(*) FROM league_snapshots WHERE league_id=1 AND raw_payload <> '{}'::jsonb").fetchone()[0] == 1
                assert db.execute("SELECT raw_payload FROM league_snapshots WHERE league_id=2").fetchone()[0] == {'raw': True}
                assert db.execute('SELECT count(*) FROM battle_ratings').fetchone()[0] == 1
                assert db.execute('SELECT message FROM sync_runs').fetchall() == [('latest',)]
        finally:
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
