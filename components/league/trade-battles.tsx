"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/schema";
import { chooseBattle, rankEntries, tradeEntries, type BattleRating, type BattleVote, type TradeEntry, type VoteResult } from "@/lib/trade-battles";
import { AnimatedRows, MotionNumber, useReducedMotion } from "../ui/motion";
import { Button, Empty, Panel } from "../ui/primitives";
import { PlayerAvatar, TeamAvatar } from "./avatars";

const date = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" }).format(new Date(value));
function TradePlayers({ ids, data }: { ids: number[]; data: Snapshot }) {
  return <ul className="battle-players">{ids.map(id => {
    const player = data.players.find(p => p.id === id);
    return <li key={id}>{player && <PlayerAvatar player={player} />}<span>{player?.name ?? `Player #${id}`}</span></li>;
  })}</ul>;
}
export function TradeSide({ entry, data, children, className = "" }: { entry: TradeEntry; data: Snapshot; children?: React.ReactNode; className?: string }) {
  const team = data.teams.find(t => t.id === entry.teamId);
  const opponents = tradeEntries(data.trades.filter(t => t.id === entry.tradeId)).filter(e => e.teamId !== entry.teamId)
    .map(e => data.teams.find(t => t.id === e.teamId)?.name ?? `Team ${e.teamId}`);
  return <article className={`trade-side ${className}`}>
    <header>{team && <TeamAvatar team={team} large />}<div><h3>{team?.name ?? `Team ${entry.teamId}`}</h3><p>with {opponents.join(", ")}</p></div><time dateTime={entry.completedAt}>{date(entry.completedAt)}</time></header>
    <div className="trade-side-assets"><section><h4>Received</h4><TradePlayers ids={entry.received} data={data} /></section><section><h4>Gave up</h4><TradePlayers ids={entry.sent} data={data} /></section></div>
    {children}
  </article>;
}
export function TradeHistory({ data }: { data: Snapshot }) {
  const entries = tradeEntries(data.trades);
  return <div className="trade-history">
    {data.tradeSyncError && <p role="status" className="battle-error">{data.tradeSyncError} Showing the last import.</p>}
    {!data.trades.length ? <Empty>{data.tradeSyncError ? "Trade history unavailable." : "No completed trades yet."}</Empty> : data.trades.map(trade =>
      <div className="trade-history-deal" key={trade.id}>{entries.filter(e => e.tradeId === trade.id).map(entry => <TradeSide key={entry.id} entry={entry} data={data} />)}</div>)}
  </div>;
}
export function TradeBattles({ data, active }: { data: Snapshot; active: boolean }) {
  const entries = useMemo(() => tradeEntries(data.trades), [data.trades]);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [ratings, setRatings] = useState<BattleRating[]>([]);
  const [ready, setReady] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rankError, setRankError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [verdict, setVerdict] = useState<{ winnerId: string; delta: number } | null>(null);
  const reduced = useReducedMotion();
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (advance.current) clearTimeout(advance.current); }; }, []);
  const pending = useRef<BattleVote | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    setPair(old => old && old.every(id => entries.some(e => e.id === id)) ? old : chooseBattle(entries));
  }, [entries]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const response = await fetch("/api/trade-battles", { cache: "no-store", signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        if (!controller.signal.aborted) { setRatings(value.ratings); setReady(true); setRankError(""); }
      } catch {
        if (!controller.signal.aborted) setRankError("Rankings unavailable. Try again.");
      } finally { running = false; }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [active, refresh]);
  const next = () => {
    if (submitting.current) return;
    pending.current = null; setError(""); setFeedback("");
    setPair(old => chooseBattle(entries, old ?? undefined));
  };
  const vote = async (winnerId: string) => {
    if (!pair || submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setFeedback("");
    const old = pending.current;
    const body: BattleVote = old && old.leftId === pair[0] && old.rightId === pair[1] && old.winnerId === winnerId ? old : {
      requestId: crypto.randomUUID(), mode: "best", leftId: pair[0], rightId: pair[1], winnerId,
    };
    pending.current = body;
    try {
      const response = await fetch("/api/trade-battles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Vote could not be saved.");
      if (!mounted.current) return;
      const result = value.result as VoteResult;
      setFeedback(`Vote saved · +${Math.round(result.delta)} MMR`);
      pending.current = null;
      setRefresh(n => n + 1);
      if (reduced) setPair(chooseBattle(entries, pair));
      else {
        setVerdict({ winnerId, delta: Math.round(result.delta) });
        advance.current = setTimeout(() => {
          setVerdict(null); setPair(chooseBattle(entries, pair));
          submitting.current = false; setBusy(false); advance.current = null;
        }, 950);
      }
    } catch (err) { if (mounted.current) setError(err instanceof Error && err.name !== "TimeoutError" && err.name !== "TypeError" ? err.message : "Could not confirm your vote. Pick again to retry."); }
    finally { if (mounted.current && !advance.current) { submitting.current = false; setBusy(false); } }
  };
  const contenders = pair?.map(id => entries.find(e => e.id === id));
  return <div className="trade-battles">
    {data.tradeSyncError && <p className="battle-error" role="status">{data.tradeSyncError} Showing the last import.</p>}
    {!contenders || contenders.some(e => !e) ? <Empty>Two completed trades are needed for battles.</Empty> : <>
      <div className="battle-heading"><h2>Which team made the better deal?</h2><Button variant="quiet" disabled={busy} onClick={next}>Skip</Button></div>
      <div className="battle-arena" aria-busy={busy}>
        {contenders.map((entry, i) => <TradeSide key={`${entry!.id}:${i}`} entry={entry!} data={data} className={verdict ? verdict.winnerId === entry!.id ? "battle-picked" : "battle-passed" : ""}>
          {verdict?.winnerId === entry!.id && <span className="battle-mmr-gain" aria-hidden="true">+{verdict.delta} MMR</span>}
          <Button variant="accent" disabled={busy} onClick={() => void vote(entry!.id)} aria-label={`Vote for ${data.teams.find(t => t.id === entry!.teamId)?.name ?? "team"}'s better deal`}>
            Better deal
          </Button>
        </TradeSide>)}
        <span className="battle-versus" aria-hidden="true">VS</span>
      </div>
      <div className="battle-feedback" aria-live="polite">{error || feedback}</div>
    </>}
    <Panel title="Trade rankings">
      {rankError ? <div className="battle-error" role="status">{rankError} <Button variant="quiet" onClick={() => setRefresh(n => n + 1)}>Retry</Button></div> : !ready ? <Empty>Loading rankings…</Empty> : !entries.length ? <Empty>No completed trades yet.</Empty> : <div className="battle-ranking-scroll"><table className="battle-rankings">
        <thead><tr><th>Rank</th><th>Deal</th><th title="Starts at 1,000. Winning votes raises MMR; losing lowers it. Higher MMR means a better-rated deal.">MMR</th><th>Votes</th></tr></thead>
        <AnimatedRows revision={JSON.stringify(ratings)}>{rankEntries(entries, ratings).map(row => {
          const team = data.teams.find(t => t.id === row.entry.teamId);
          return <tr key={row.entry.id} data-motion-key={row.entry.id}><td>{row.rank === null ? "—" : `#${row.rank}`}</td><td><details><summary>{team && <TeamAvatar team={team} />}<span>{team?.name ?? `Team ${row.entry.teamId}`}<small>{date(row.entry.completedAt)}</small></span></summary><div className="ranked-deal"><TradeSide entry={row.entry} data={data} /></div></details></td><td><MotionNumber>{row.votes ? Math.round(row.rating).toLocaleString("en-US") : "—"}</MotionNumber></td><td><MotionNumber>{row.votes}</MotionNumber></td></tr>;
        })}</AnimatedRows>
      </table></div>}
    </Panel>
  </div>;
}
