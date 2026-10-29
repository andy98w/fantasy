"""Local development sync loop; hosted deployments use the Railway cron job."""
from __future__ import annotations

import argparse
import os
import signal
import sys
from threading import Event

from dotenv import load_dotenv
from .sync import ROOT, run
from .espn import SyncError

INTERVAL_SECONDS = 300


def watch(stopped: Event):
    args = argparse.Namespace(probe=False, news_only=False)
    while not stopped.is_set():
        try:
            run(args)
        except Exception as error:
            # Never print arbitrary upstream exceptions: they may contain credentials.
            message = str(error) if isinstance(error, SyncError) else "Sync failed; last saved data retained."
            print(f"{message} Retrying in five minutes.", file=sys.stderr, flush=True)
        # Wait after completion so slow or failed imports never overlap.
        stopped.wait(INTERVAL_SECONDS)


def main():
    load_dotenv(ROOT / ".env")
    if os.environ.get("DATA_MODE", "demo") != "live":
        print("Demo mode: automatic ESPN sync disabled.", flush=True)
        return
    stopped = Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    print("Automatic ESPN sync enabled (every five minutes after completion).", flush=True)
    watch(stopped)


if __name__ == "__main__":
    main()
