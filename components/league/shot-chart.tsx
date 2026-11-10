"use client";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { type Shot, type ShotReport, shootingTotals, shotZone, periodStart } from "@/lib/shots";
import { Select } from "../ui/select";
import { Button } from "../ui/primitives";
import { StickyTable } from "../ui/sticky-table";

const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;
const periodLabel = (p: number) => p <= 4 ? `Q${p}` : `OT${p - 4}`;
function timeLabel(time: number) {
  const p = time <= 2880 ? Math.max(1, Math.ceil(time / 720)) : 4 + Math.ceil((time - 2880) / 300);
  const remaining = Math.max(0, Math.ceil(periodStart(p) + (p <= 4 ? 720 : 300) - time));
  return `${periodLabel(p)} ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}
export function ShotChart({ report, teams, timeline = true, dates = {}, title = "Shot chart", fixedPlayer = false }: {
  report: ShotReport; teams: { id: string; name: string }[]; timeline?: boolean;
  dates?: Record<string, string>; title?: string; fixedPlayer?: boolean;
}) {
  const timelineId = useId();
  const [team, setTeam] = useState("all"), [player, setPlayer] = useState("all"), [period, setPeriod] = useState("all"), [result, setResult] = useState("all");
  const [until, setUntil] = useState<number | null>(null), [playing, setPlaying] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const max = report.duration;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setUntil(value => {
      const next = Math.min(max, (value ?? 0) + 30);
      if (next === max) setPlaying(false);
      return next;
    }), 250);
    return () => window.clearInterval(timer);
  }, [playing, max]);
  const base = useMemo(() => report.shots.filter(s => (team === "all" || s.teamId === team) && (player === "all" || s.playerId === Number(player))), [report.shots, team, player]);
  const eligible = base.filter(s => (period === "all" || s.period === Number(period)) && (!timeline || until === null || s.elapsed <= until));
  const visible = eligible.filter(s => result === "all" || (result === "made") === s.made);
  const located = visible.filter(s => s.x !== null && s.y !== null);
  const totals = shootingTotals(eligible);
  const heaves = base.filter(s => s.teamAttempt).length;
  const active = visible.find(s => `${s.gameId}:${s.id}` === selected);
  const height = Math.max(47, ...report.shots.filter(s => s.y !== null).map(s => Math.min(94, s.y! + 8.25)));
  const playerOptions = [...new Map(report.shots.filter(s => team === "all" || s.teamId === team).map(s => [s.playerId, s.playerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const periods = [...new Set(report.shots.map(s => s.period))].sort((a,b) => a-b);
  const expected = player !== "all" ? report.expected[player] : team === "all" ? Object.values(report.expected).reduce((a,b) => a+b,0) : undefined;
  const zoneNames = ["At rim", "Other 2PT", "Corner 3", "Above-break 3", "Backcourt", "Unlocated"];
  const describe = (s: Shot) => `${dates[s.gameId] ? dates[s.gameId] + " · " : ""}${periodLabel(s.period)} ${s.clock} · ${s.text}${s.teamAttempt ? " · Heave, excluded from player FG" : ""}`;
  return <section className="shot-explorer" aria-label={title}>
    <div className="shot-topbar"><div className="shot-heading"><h3>{title}</h3><span className="shot-legend"><span className="positive-text">● Made</span><span className="negative-text">× Missed</span></span></div>
    <div className="shot-controls">
      {!fixedPlayer && <><Select label="Shot team" value={team} onChange={value => { setTeam(value); setPlayer("all"); }} options={[{ value: "all", label: "Both teams" }, ...teams.map(t => ({value:t.id,label:t.name}))]} />
      <Select label="Shot player" value={player} onChange={setPlayer} options={[{ value:"all",label:"All players" }, ...playerOptions.map(([id,name]) => ({value:String(id),label:name}))]} /></>}
      <Select label="Shot quarter" value={period} onChange={setPeriod} options={[{value:"all",label:"All quarters"},...periods.map(p => ({value:String(p),label:periodLabel(p)}))]} />
      <Select label="Shot result" value={result} onChange={setResult} options={[{value:"all",label:"All shots"},{value:"made",label:"Made"},{value:"missed",label:"Missed"}]} />
    </div>
    </div>
    {!report.available && <p role="status" className="inline-notice">Shot locations aren’t available for this game.</p>}
    {report.available && expected !== undefined && expected !== base.filter(s => !s.teamAttempt).length && <p className="shot-coverage" role="status">Play-by-play: {base.filter(s => !s.teamAttempt).length} attempts · Box score: {expected}. Shot coverage differs.</p>}
    {heaves > 0 && <p className="shot-coverage">{heaves} heave{heaves === 1 ? "" : "s"} excluded from player FG%</p>}
    {report.skipped > 0 && <p className="shot-coverage">{report.skipped} play entries could not be verified.</p>}
    <div className="shot-layout">
      <div className="shot-court-wrap">
        <svg className="shot-court" viewBox={`-2 -2 54 ${height + 4}`} role="group" aria-label="Basketball court shot locations. All shots face the same basket.">
          <g className="court-lines" fill="none" strokeWidth="0.16" aria-hidden="true">
            <rect x="0" y="0" width="50" height={height > 47 ? 94 : 47} />
            <path d="M17 0V19H33V0 M19 0V19 M31 0V19 M22 4H28 M3 0V14.2 A23.75 23.75 0 0 0 47 14.2 V0" />
            <circle cx="25" cy="5.25" r="0.75" className="court-hoop" />
            <circle cx="25" cy="19" r="6" />
            <path d="M21 5.25 A4 4 0 0 0 29 5.25 M0 47H50" />
            <circle cx="25" cy="47" r="6" />
          </g>
          {located.map(s => { const key = `${s.gameId}:${s.id}`, chosen = selected === key; return <g key={key} className={`court-shot ${s.made ? "made" : "missed"} ${chosen ? "chosen" : ""}`} transform={`translate(${s.x},${s.y! + 5.25})`} role="button" tabIndex={0}
            aria-label={describe(s)} aria-pressed={chosen} onClick={() => setSelected(key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(key); } }}>
            <title>{describe(s)}</title><circle r="1.1" className="shot-hit-area" />
            {s.made ? <circle r="0.48" /> : <path d="M-.48-.48L.48.48 M-.48.48L.48-.48" fill="none" strokeWidth=".25" />}
            {chosen && <circle r="1" fill="none" stroke="var(--gold)" strokeWidth=".2" />}
          </g>; })}
        </svg>
        <p className="shot-detail" aria-live="polite">{active ? describe(active) : visible.length ? "Select a shot for details." : "No shots for this selection."}</p>
        {visible.length !== located.length && <span className="shot-coverage">{visible.length - located.length} attempts have no usable location.</span>}
        {timeline && <div className="shot-timeline">
          <Button className="shot-play" onClick={() => { if (!playing && (until === null || until >= max)) setUntil(0); setPlaying(!playing); }} disabled={!report.shots.length} aria-label={playing ? "Pause shot replay" : "Play shot replay"}>{playing ? "Ⅱ Pause" : "▶ Play"}</Button>
          <div><label htmlFor={timelineId}>{until === null || until === max ? "All shots" : timeLabel(until)}</label>
            <input className="shot-range" style={{"--shot-progress": `${100 * (until ?? max) / max}%`} as CSSProperties} id={timelineId} aria-label="Game timeline" aria-valuetext={until === null || until === max ? "All shots" : timeLabel(until)} type="range" min="0" max={max} step="1" value={until ?? max} onChange={event => { setPlaying(false); setUntil(Number(event.target.value)); }} />
            <div className="shot-ticks"><span>Tip-off</span>{Array.from({length:Math.ceil(max / 720)-1},(_,i)=>(i+1)*720).filter(t=>t<Math.min(max,2881)).map(t=><span key={t} style={{left:`${100*t/max}%`}}>{t===2880 ? "Q4" : `Q${t/720}`}</span>)}<span>End</span></div></div>
        </div>}
      </div>
      <aside className="shot-breakdown" aria-label="Shooting breakdown">
        <div className="shot-summary"><span>FG<strong>{totals.made}/{totals.attempted}</strong><small>{pct(totals.fg)}</small></span><span>3PT<strong>{totals.made3}/{totals.attempted3}</strong><small>{pct(totals.attempted3 ? totals.made3/totals.attempted3 : null)}</small></span><span title="Effective field-goal percentage gives made threes extra weight">eFG%<strong>{pct(totals.efg)}</strong></span></div>
        <StickyTable className="data-table shot-zones"><caption>By location</caption><thead><tr><th>Zone</th><th>FG</th><th>FG%</th></tr></thead><tbody>{zoneNames.map(zone => { const shots = eligible.filter(s => shotZone(s) === zone), stats = shootingTotals(shots); return stats.attempted > 0 && <tr key={zone}><th scope="row">{zone}</th><td>{stats.made}/{stats.attempted}</td><td>{pct(stats.fg)}</td></tr>; })}</tbody></StickyTable>
        <details className="shot-events"><summary>Shot log ({visible.length})</summary><ol>{visible.map(s => <li key={`${s.gameId}:${s.id}`}><button className={s.made ? "positive-text" : "negative-text"} onClick={() => setSelected(`${s.gameId}:${s.id}`)}>{describe(s)}</button></li>)}</ol></details>
      </aside>
    </div>
  </section>;
}
