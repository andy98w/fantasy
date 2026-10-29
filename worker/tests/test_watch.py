from threading import Event
from worker import watch


def test_failed_import_retries_without_exposing_arbitrary_errors(monkeypatch, capsys):
    stopped = Event()
    attempts = []

    def sync(args):
        attempts.append(args)
        if len(attempts) == 1:
            raise RuntimeError("private upstream credential")
        stopped.set()

    monkeypatch.setattr(watch, "run", sync)
    monkeypatch.setattr(watch, "INTERVAL_SECONDS", 0)
    watch.watch(stopped)
    assert len(attempts) == 2
    assert all(not args.probe and not args.news_only for args in attempts)
    stderr = capsys.readouterr().err
    assert "Retrying" in stderr
    assert "private upstream credential" not in stderr


def test_demo_mode_never_starts_sync(monkeypatch):
    monkeypatch.setenv("DATA_MODE", "demo")
    monkeypatch.setattr(watch, "load_dotenv", lambda *_: None)
    monkeypatch.setattr(watch, "watch", lambda *_: (_ for _ in ()).throw(AssertionError("Demo must not sync")))
    watch.main()
