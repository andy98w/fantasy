"use client";
import { useEffect, useState } from "react";
import type { PlayerInjury } from "@/lib/player-injury";
import { nbaDate } from "@/lib/nba";
import { Button } from "../ui/primitives";
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const updated = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
export function PlayerInjuryOutlook({ playerId, season, status }: { playerId: number; season: number; status: string }) {
  const [data, setData] = useState<PlayerInjury | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(false);
    fetch(`/api/players/${playerId}/injury?season=${season}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
      .then(async response => { if (!response.ok) throw new Error("Unavailable"); return await response.json() as PlayerInjury; })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [playerId, season, retry]);
  const report = data?.report;
  if (status === "ACTIVE" && !report) return null;
  const past = report?.estimatedReturn && report.estimatedReturn < nbaDate(new Date());
  return <section className="player-injury-outlook" aria-label="Injury and return outlook">
    {error ? <p role="status">Injury report unavailable. <Button variant="quiet" onClick={() => setRetry(n => n + 1)}>Retry</Button></p>
      : !data ? <p role="status">Loading injury report…</p>
      : !report ? <p>Return date unknown.</p> : <>
        <div className="injury-outlook-meta"><span>{report.status}{report.injury ? ` · ${report.injury}` : ""}</span><strong className="injury-return-date">{report.estimatedReturn ? `${past ? "Past estimate" : "Est. return"}: ${day.format(new Date(`${report.estimatedReturn}T12:00:00Z`))}` : "Return date unknown"}</strong></div>
        {report.summary && <p>{report.summary}</p>}
        <div className="injury-outlook-meta"><a href={report.url} target="_blank" rel="noopener noreferrer">{report.source}{report.source !== "ESPN" ? " / ESPN" : ""}{report.reportedAt ? ` · ${updated.format(new Date(report.reportedAt))}` : ""} ↗</a></div>
        {data.stale && <p className="today-stale" role="status">Saved report. <Button variant="quiet" onClick={() => setRetry(n => n + 1)}>Retry</Button></p>}
      </>}
  </section>;
}
