from argparse import Namespace
import pytest
from worker import sync
from worker.espn import SyncError


def test_hosted_worker_requires_durable_database_before_network_or_local_write(monkeypatch, tmp_path):
    monkeypatch.setattr(sync, 'load_dotenv', lambda *args: None)
    monkeypatch.setenv('REQUIRE_DATABASE', '1')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('SNAPSHOT_PATH', str(tmp_path/'league.json'))
    with pytest.raises(SyncError, match='DATABASE_URL is required'):
        sync.run(Namespace(probe=False, news_only=False))
    assert list(tmp_path.iterdir()) == []


def test_retention_is_explicit_and_validated(monkeypatch):
    from worker.retention import retention_days, prune_snapshots
    monkeypatch.delenv('SNAPSHOT_RETENTION_DAYS', raising=False)
    assert retention_days() == 0
    prune_snapshots(None, 1, 2027, 0)
    for value in ['-1', '367', 'no']:
        monkeypatch.setenv('SNAPSHOT_RETENTION_DAYS', value)
        with pytest.raises(SyncError, match='SNAPSHOT_RETENTION_DAYS'):
            retention_days()
    monkeypatch.setenv('SNAPSHOT_RETENTION_DAYS', '30')
    assert retention_days() == 30
