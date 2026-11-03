"use client";
import { useEffect, useState } from "react";
import type { PlayerInjury } from "@/lib/player-injury";
import { nbaDate } from "@/lib/nba";
import { Button } from "../ui/primitives";
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const updated = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
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
    <h3>Injury / return outlook</h3>
    {error ? <p role="status">Injury report unavailable. <Button variant="quiet" onClick={() => setRetry(n => n + 1)}>Retry</Button></p>
      : !data ? <p role="status">Loading injury report…</p>
      : !report ? <p>No return timetable available from ESPN.</p> : <>
        <div className="injury-outlook-meta"><span>{report.status}{report.injury ? ` · ${report.injury}` : ""}</span><a href={report.url} target="_blank" rel="noopener noreferrer">ESPN player report ↗</a></div>
        <strong className="injury-return-date">{report.estimatedReturn ? `${past ? "Previously estimated return" : "Estimated return (ESPN)"}: ${day.format(new Date(`${report.estimatedReturn}T12:00:00Z`))}` : "No estimated return date reported"}</strong>
        <small>{past ? "This date has passed; awaiting an updated estimate." : report.estimatedReturn ? "Estimate only; may reflect the next possible game, not a confirmed return." : ""}{report.reevaluation ? " The report mentions reevaluation; that is not clearance to play." : ""}</small>
        {report.summary && <p>{report.summary}</p>}
        {report.report && <details><summary>Report details</summary><p>{report.report}</p></details>}
        <div className="injury-outlook-meta"><span>{report.source}{report.source !== "ESPN" ? " via ESPN" : ""} · {report.reportedAt ? `Report ${updated.format(new Date(report.reportedAt))} PT` : "Report date unavailable"}</span></div>
        {data.stale && <p className="today-stale" role="status">Showing a saved report; refresh unavailable. <Button variant="quiet" onClick={() => setRetry(n => n + 1)}>Retry</Button></p>}
      </>}
  </section>;
}
