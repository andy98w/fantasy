"""Opt-in PostgreSQL retention. Call inside the successful sync transaction."""
from __future__ import annotations
import os
from .espn import SyncError


def retention_days():
    try:
        days = int(os.environ.get('SNAPSHOT_RETENTION_DAYS', '0'))
    except ValueError:
        raise SyncError('SNAPSHOT_RETENTION_DAYS must be 0 (disabled) or 1–366.') from None
    if not 0 <= days <= 366:
        raise SyncError('SNAPSHOT_RETENTION_DAYS must be 0 (disabled) or 1–366.')
    return days


def prune_snapshots(connection, league_id, season, days):
    if not days:
        return
    # Always keep the 24 newest captures, plus the newest capture on each UTC
    # calendar day in the window. Historical matchups and power history remain
    # embedded in each snapshot. Scope every mutation to this league + season.
    connection.execute('''
        WITH recent AS (
            SELECT id FROM league_snapshots WHERE league_id=%s AND season=%s
            ORDER BY captured_at DESC,id DESC LIMIT 24
        ), daily AS (
            SELECT DISTINCT ON ((captured_at AT TIME ZONE 'UTC')::date) id
            FROM league_snapshots WHERE league_id=%s AND season=%s
              AND captured_at >= now() - make_interval(days => %s)
            ORDER BY (captured_at AT TIME ZONE 'UTC')::date DESC,captured_at DESC,id DESC
        ), latest_raw AS (
            SELECT id FROM league_snapshots
            WHERE league_id=%s AND season=%s AND raw_payload <> '{}'::jsonb
            ORDER BY captured_at DESC,id DESC LIMIT 1
        )
        DELETE FROM league_snapshots WHERE league_id=%s AND season=%s
          AND id NOT IN (SELECT id FROM recent UNION SELECT id FROM daily UNION SELECT id FROM latest_raw)
    ''', (league_id,season,league_id,season,days,league_id,season,league_id,season))
    # A news-only snapshot may have no raw payload; preserve the newest available one.
    connection.execute('''
        UPDATE league_snapshots SET raw_payload='{}'::jsonb
        WHERE league_id=%s AND season=%s AND raw_payload <> '{}'::jsonb
          AND id <> (SELECT id FROM league_snapshots
                     WHERE league_id=%s AND season=%s AND raw_payload <> '{}'::jsonb
                     ORDER BY captured_at DESC,id DESC LIMIT 1)
    ''', (league_id,season,league_id,season))
    connection.execute('''
        DELETE FROM sync_runs WHERE league_id=%s AND season=%s
          AND finished_at < now() - make_interval(days => %s)
          AND id <> (SELECT id FROM sync_runs WHERE league_id=%s AND season=%s
                     ORDER BY finished_at DESC,id DESC LIMIT 1)
    ''', (league_id,season,days,league_id,season))
