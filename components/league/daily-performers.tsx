"use client";
import { useMemo, useState } from "react";
import type { Snapshot, Player } from "@/lib/schema";
import type { TodayData } from "@/lib/nba";
import { gameLabel } from "@/lib/nba";
import { dailyPerformers, selectPerformers, type DailyMode } from "@/lib/daily";
import { Tabs, Empty } from "../ui/primitives";
import { PlayerAvatar } from "./avatars";
import { MotionNumber } from "../ui/motion";

export function DailyPerformers({ data, today, onPlayer }: { data: Snapshot; today?: TodayData; onPlayer: (p: Player) => void }) {
  const [mode, setMode] = useState<DailyMode>("top");
  const rows = useMemo(() => dailyPerformers(data, today?.performances ?? [], today?.games ?? []), [data, today]);
  const selected = selectPerformers(rows, mode);
  const negative = mode === "worst" || mode === "letdown";
  return <section className={`daily-performers ${negative ? "daily-negative" : ""}`} aria-label="Today's performers">
    <div className="section-heading"><h2>Today’s performers</h2><span title="9-category production against the season reference pool. Surprises compare today's production with that player's season per-game average. Underperformers require a finished game and at least 10 minutes played.">{negative ? "Final games · 10+ min" : "9-cat"}</span></div>
    <Tabs label="Today's performers" value={mode} onChange={setMode} options={[{value:"top", label:"Top performers"}, {value:"worst", label:"Shitters"}, {value:"surprise", label:"Surprises"}, {value:"letdown", label:"Letdowns"}]} />
    {today?.boxscoreStatus === "partial" && <p className="today-stale" role="status">Some game stats are unavailable.</p>}
    {today?.status === "stale" && <p className="today-stale" role="status">Showing saved game stats.</p>}
    {today?.boxscoreStatus === "error" || today?.status === "error" ? <Empty>Player stats unavailable. Retrying automatically.</Empty> : selected.length ? <div className="daily-player-grid">{selected.map(({player, line, game, delta}, index) => {
      const s = line.stats, team = data.teams.find(t => t.id === player.teamId);
      return <button type="button" className="daily-player-card" key={`${player.id}:${game.id}`} onClick={() => onPlayer(player)} aria-label={`#${index + 1} ${player.name}, view season profile`}>
        <div className="daily-player-heading"><span className="daily-rank">#{index + 1}</span><span className={`daily-state ${game.state}`}>{gameLabel(game)}</span></div>
        <div className="daily-player-top"><PlayerAvatar player={player} large /><span className="daily-player-identity"><strong>{player.name}</strong><small>{team?.name}</small></span></div>
        <div className="daily-main-stats">{["PTS","REB","AST","STL","BLK"].map(c => <span key={c}><b><MotionNumber>{s[c]}</MotionNumber></b><small>{c}</small></span>)}</div>
        <div className="daily-shooting"><span>{s.FGM}/{s.FGA} FG</span><span>{s.FTM}/{s.FTA} FT</span><span>{s["3PM"]} 3PM</span><span>{s.TO} TO</span><span>{Math.round(line.minutes)} min</span></div>
        {(mode === "surprise" || mode === "letdown") && delta !== null && <span className="daily-delta" title="Difference in summed nine-category z-scores from the player's season average; not a percentage or season power change.">{delta > 0 ? "Above" : "Below"} season average</span>}
      </button>;
    })}</div> : <Empty>{negative ? "No qualifying finished performances yet." : mode === "surprise" ? "No above-average performances yet." : "Rostered player performances appear when games start."}</Empty>}
  </section>;
}
