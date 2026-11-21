"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/schema";
import { canSimulate, gameElapsed, courtFrame, simulate, simulationState, type Simulation, type Side } from "@/lib/simulation";
import { AnalysisPlayerPicker } from "./analysis-player-picker";
import { PlayerAvatar } from "./avatars";
import { Button, Tabs, Empty } from "../ui/primitives";
import { Select } from "../ui/select";
const Court = dynamic(() => import("./simulation-court"), { ssr: false, loading: () => <div className="sim-court empty-state">Loading court…</div> });
const teamNames = ["Teal", "Pink"];
const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function Simulate({ players, onPlayer }: { players: Player[]; onPlayer: (player: Player) => void }) {
  const eligible = useMemo(() => players.filter(canSimulate).sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999)), [players]);
  const [ids, setIds] = useState<number[][]>(() => [eligible.slice(0, 10).filter((_, i) => i % 2 === 0).map(p => p.id), eligible.slice(0, 10).filter((_, i) => i % 2 === 1).map(p => p.id)]);
  const [game, setGame] = useState<Simulation | null>(null), [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState("120"), [speed, setSpeed] = useState("2"), [motion, setMotion] = useState(true), [edit, setEdit] = useState<[Side, number] | null>(null);
  const [boxSide, setBoxSide] = useState("0"), elapsed = useRef(0);
  const [courtReady, setCourtReady] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const onCourtReady = useCallback(() => { setCourtReady(true); setPlaying(true); screen.current?.scrollIntoView({ block: "start" }); }, []);
  useEffect(() => { if (game) { screen.current?.scrollIntoView({ block: "start" }); screen.current?.focus({ preventScroll: true }); } }, [game]);
  useEffect(() => { const media = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setMotion(!media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const lineups = useMemo(() => ids.map(team => team.map(id => eligible.find(p => p.id === id)).filter((p): p is Player => !!p)) as [Player[], Player[]], [ids, eligible]);
  const ready = lineups.every(t => t.length === 5) && new Set(ids.flat()).size === 10;
  useEffect(() => {
    if (!playing || !game) return;
    let handle = 0, before = performance.now(), lastPaint = before;
    const tick = (now: number) => {
      if (document.visibilityState !== "visible") { setPlaying(false); return; }
      elapsed.current = Math.min(game.playbackDuration, elapsed.current + Math.min(.2, (now - before) / 1000) * Number(speed)); before = now;
      if (now - lastPaint > 50 || elapsed.current >= game.playbackDuration) { setTime(elapsed.current); lastPaint = now; }
      if (elapsed.current >= game.playbackDuration) setPlaying(false); else handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    const hide = () => { if (document.visibilityState !== "visible") setPlaying(false); };
    document.addEventListener("visibilitychange", hide);
    return () => { cancelAnimationFrame(handle); document.removeEventListener("visibilitychange", hide); };
  }, [playing, game, speed]);
  const seek = (value: number) => { elapsed.current = value; setTime(value); };
  const start = () => { if (!ready) return; setGame(simulate(lineups, Number(duration), crypto.getRandomValues(new Uint32Array(1))[0])); seek(0); setEdit(null); setCourtReady(false); setPlaying(false); };
  if (eligible.length < 10) return <Empty>Simulate needs ten players with at least three games and complete season stats.</Empty>;
  const snapshot = game ? simulationState(game, time) : null, finished = !!game && time >= game.playbackDuration;
  const current = game ? courtFrame(game, time, motion) : null;
  const choose = (id: number) => { if (!edit) return; setIds(old => old.map((team, side) => side === edit[0] ? team.map((value, slot) => slot === edit[1] ? id : value) : team)); setEdit(null); };
  return <div className="simulation" ref={screen} tabIndex={-1}>
    {!game ? <div className="sim-setup">
      <div className="sim-setup-toolbar"><h2>Build your matchup</h2><div className="sim-setup-actions">
        <Select label="Exhibition length" value={duration} onChange={setDuration} options={[{value:"120",label:"2-minute game"},{value:"300",label:"5-minute game"},{value:"600",label:"10-minute game"}]} />
        <Button variant="accent" disabled={!ready} onClick={start}>Watch game →</Button>
      </div></div>
      <div className="sim-lineups" aria-label="Exhibition lineups">
        {[0, 1].map(side => <section className={`sim-lineup sim-side-${side}`} key={side}>
          <h2>{teamNames[side]} <span>{lineups[side].length} / 5 players</span></h2>
          {lineups[side].map((p, index) => <div key={`${side}-${index}`}>
            <div className="sim-roster-row"><span className="sim-shirt">{index + 1}</span><PlayerAvatar player={p} /><div className="sim-roster-name"><strong>{p.name}</strong><small>{p.nbaTeam} / {p.position}</small></div>
              <Button variant="quiet" aria-label={`Replace ${p.name} on ${teamNames[side]}`} onClick={() => setEdit(edit?.[0] === side && edit[1] === index ? null : [side as Side, index])}>{edit?.[0] === side && edit[1] === index ? "Cancel" : "Change"}</Button>
            </div>
            {edit?.[0] === side && edit[1] === index && <div className="sim-picker"><AnalysisPlayerPicker players={eligible.filter(p => !ids.flat().includes(p.id))} onChange={choose} label={`Find a ${teamNames[side]} player`} /></div>}
          </div>)}
        </section>)}
      </div>
    </div> : <>
      <div className="sim-watch-toolbar"><Button onClick={() => { setPlaying(false); setGame(null); setCourtReady(false); seek(0); }}>← Edit teams</Button><Button disabled={!ready} onClick={start}>New game</Button></div>
      <section className="sim-arena" aria-label="Exhibition game">
        <div className="sim-scoreboard">
          <div className="sim-score-teal"><div className="sim-team-label"><span>Teal</span><small>Fouls {snapshot?.lines.slice(0,5).reduce((n,p)=>n+p.pf,0) ?? 0}</small></div><strong>{snapshot?.score[0] ?? 0}</strong></div>
          <div className="sim-clock"><strong>{clockText(Math.max(0, game.duration - gameElapsed(game,time)))}</strong><span>{!courtReady ? "Loading court…" : finished ? snapshot?.score[0] === snapshot?.score[1] ? "Final · Tie" : "Final" : playing ? "Playing" : "Paused"}</span></div>
          <div className="sim-score-pink"><strong>{snapshot?.score[1] ?? 0}</strong><div className="sim-team-label"><span>Pink</span><small>Fouls {snapshot?.lines.slice(5).reduce((n,p)=>n+p.pf,0) ?? 0}</small></div></div>
        </div>
        <div className="sim-stage"><Court key={game.seed} game={game} clock={elapsed} motion={motion} onReady={onCourtReady} />
          {current?.event && <div className={`sim-event sim-event-${current.event.tone}`} role="status"><strong>{current.event.title}</strong><span>{current.event.detail}</span></div>}
        </div>
        <div className="sim-transport">
          <div className="sim-timeline"><input type="range" aria-label="Game timeline" disabled={!courtReady} min={0} max={game.playbackDuration} step={.1} value={time} onChange={e => { setPlaying(false); seek(Number(e.target.value)); }} /><span>{clockText(time)} / {clockText(game.playbackDuration)}</span></div>
          <div className="sim-playback">
            <Button variant="accent" disabled={!courtReady} onClick={() => { if (finished) seek(0); setPlaying(p => !p); }}>{finished ? "Replay" : playing ? "Pause" : "Play"}</Button>
            <Button variant="quiet" disabled={!courtReady} onClick={() => { setPlaying(false); seek(game.playbackDuration); }}>Final result</Button>
            <Select label="Playback speed" value={speed} onChange={setSpeed} options={[{value:"1",label:"1× speed"},{value:"2",label:"2× speed"},{value:"4",label:"4× speed"}]} />
            <label className="sim-motion"><input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)} /> Court motion</label>
          </div>
        </div>
      </section>
      <div className="sim-call" aria-live="polite">{current?.event ? [current.event.title,current.event.detail].filter(Boolean).join(" · ") : finished ? "Game complete" : `${teamNames[current?.play.side ?? 0]} ball · ${courtReady ? current?.phase : "Ready for tip-off"}`}</div>
      <div className="sim-cast" aria-label="Players on court">{[0, 1].map(side => <div className={`sim-cast-team sim-side-${side}`} key={side}>{game.players.slice(side * 5, side * 5 + 5).map(p => <button key={p.id} title={p.name} aria-label={`View ${p.name}`} onClick={() => { const original = players.find(v => v.id === p.id); setPlaying(false); if (original) onPlayer(original); }}><PlayerAvatar player={p} /><span>{p.name}</span></button>)}</div>)}</div>
    </>}
    {game && snapshot && <div className="sim-results">
      <section className="panel sim-box"><div className="panel-heading"><h2>Box score</h2><Tabs label="Simulated box score team" value={boxSide} onChange={setBoxSide} options={[{value:"0",label:"Teal"},{value:"1",label:"Pink"}]} /></div>
        <div className="table-scroll"><table><thead><tr><th>Player</th>{["PTS","REB","AST","STL","BLK","TO","PF","FG","3PT","FT"].map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{game.players.slice(Number(boxSide)*5, Number(boxSide)*5+5).map((p, i) => { const l = snapshot.lines[Number(boxSide)*5+i]; const original = players.find(v => v.id === p.id); return <tr key={p.id}><td><button className="sim-player-link" onClick={() => { setPlaying(false); if (original) onPlayer(original); }}>{p.name}</button></td>{[l.pts,l.reb,l.ast,l.stl,l.blk,l.to,l.pf,`${l.fgm}/${l.fga}`,`${l.tpm}/${l.tpa}`,`${l.ftm}/${l.fta}`].map((v,j)=><td key={j}>{v}</td>)}</tr>; })}</tbody></table></div>
      </section>
      <section className="panel sim-log"><div className="panel-heading"><h2>Play-by-play</h2></div><div className="sim-log-items" tabIndex={0}>{snapshot.completed.length ? [...snapshot.completed].reverse().map(p => <div className={`sim-log-row sim-side-${p.side}`} key={p.end}><time>{clockText(game.duration-p.gameEnd)}</time><p>{p.text}</p><strong>{p.score.join("–")}</strong></div>) : <p className="empty-state">Waiting for the first possession.</p>}</div></section>
    </div>}
  </div>;
}
