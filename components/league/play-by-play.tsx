"use client";
import { useState } from "react";
import type { NbaGame } from "@/lib/nba";
import { playPeriodLabel, selectPlays, type PlayByPlayReport } from "@/lib/play-by-play";
import { Empty } from "../ui/primitives";
import { Select } from "../ui/select";
import { NbaAvatar } from "./avatars";

export function PlayByPlay({ report, game }: { report?: PlayByPlayReport; game: NbaGame }) {
  const [period, setPeriod] = useState("all");
  const [order, setOrder] = useState("latest");
  if (!report?.available || !report.plays.length) return <Empty>{game.state === "scheduled" ? "Plays appear when the game starts." : "Play-by-play is not available yet."}</Empty>;
  const periods = [...new Set(report.plays.map(play => play.period))].sort((a, b) => a - b);
  const rows = selectPlays(report, period, order === "latest");
  const groups = [...new Set(rows.map(play => play.period))];
  return <section className="play-feed" aria-label="Play-by-play">
    <div className="play-feed-controls">
      <Select label="Play-by-play quarter" value={period} onChange={setPeriod} options={[{ value: "all", label: "All quarters" }, ...periods.map(p => ({ value: String(p), label: playPeriodLabel(p) }))]} />
      <Select label="Play-by-play order" value={order} onChange={setOrder} options={[{ value: "latest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
    </div>
    {report.skipped > 0 && <p className="today-stale" role="status">Some plays are unavailable.</p>}
    {!rows.length && <Empty>No plays in this quarter yet.</Empty>}
    {groups.map(p => <section className="play-feed-period" key={p} aria-label={playPeriodLabel(p)}>
      <div className="play-feed-heading"><h3>{playPeriodLabel(p)}</h3><span>{game.away.abbrev} <span aria-hidden="true">–</span> {game.home.abbrev}</span></div>
      <ol>
        {rows.filter(play => play.period === p).map(play => {
          const team = [game.away, game.home].find(t => t.id === play.teamId);
          return <li key={play.id} className={play.scoring ? "play-scoring" : undefined}>
            <span className="play-clock">{play.clock}</span>
            <span className="play-team" title={team?.name}>{team && <NbaAvatar team={team} />}</span>
            <p>{play.text}</p>
            <span className="play-score" aria-label={`${game.away.abbrev} ${play.awayScore ?? "unknown"}, ${game.home.abbrev} ${play.homeScore ?? "unknown"}`}>
              <span>{play.awayScore ?? "—"}</span><span aria-hidden="true">–</span><span>{play.homeScore ?? "—"}</span>
            </span>
          </li>;
        })}
      </ol>
    </section>)}
  </section>;
}
