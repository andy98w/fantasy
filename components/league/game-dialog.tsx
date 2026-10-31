"use client";

import { useEffect, useRef, useState } from "react";
import { BOX_COLUMNS, type BoxTeam, type GameBoxscore } from "@/lib/game-boxscore";
import { gameLabel, NBA_TIMEZONE, type NbaGame, type NbaTeam } from "@/lib/nba";
import { NbaAvatar, PlayerAvatar } from "./avatars";
import { Button, Empty } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
import { MotionNumber } from "../ui/motion";

export function BoxscoreTable({ team, box }: { team: NbaTeam; box?: BoxTeam }) {
  return <section className="boxscore-team" aria-label={`${team.name} box score`}>
    <h3><NbaAvatar team={team} />{team.name}</h3>
    {!box?.players.length ? <Empty>Box score not available yet.</Empty> :
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`${team.abbrev} player stats`}>
        <table className="data-table boxscore-table">
          <thead><tr><th scope="col">Player</th>{BOX_COLUMNS.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
          <tbody>{[true, false].map((starter) => {
            const players = box.players.filter((player) => player.starter === starter);
            return players.length > 0 && <BoxscoreGroup key={String(starter)} players={players} label={starter ? "Starters" : "Bench"} />;
          })}</tbody>
          {Object.keys(box.totals).length > 0 && <tfoot><tr><th scope="row">Total</th>{BOX_COLUMNS.map(([key]) => <td key={key}>{box.totals[key] ?? "—"}</td>)}</tr></tfoot>}
        </table>
      </div>}
  </section>;
}

function BoxscoreGroup({ players, label }: { players: BoxTeam["players"]; label: string }) {
  return <>
    <tr className="boxscore-group"><th colSpan={BOX_COLUMNS.length + 1} scope="rowgroup">{label}</th></tr>
    {players.map((player) => <tr key={player.id} className={player.didNotPlay ? "boxscore-dnp" : undefined}>
      <th scope="row"><span className="boxscore-player"><PlayerAvatar player={player} /><span>{player.name}</span></span></th>
      {player.didNotPlay ? <td colSpan={BOX_COLUMNS.length} className="boxscore-reason">DNP{player.reason ? ` · ${player.reason.toLowerCase()}` : ""}</td>
        : BOX_COLUMNS.map(([key]) => <td key={key}>{player.stats[key] ?? "—"}</td>)}
    </tr>)}
  </>;
}

export function GameDialog({ game: initialGame, onClose }: { game: NbaGame; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<GameBoxscore | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetch(`/api/games/${encodeURIComponent(initialGame.id)}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
        });
        if (!response.ok) throw new Error("Box score unavailable");
        const value: GameBoxscore = await response.json();
        if (value.game?.id !== initialGame.id) throw new Error("Wrong game");
        if (!disposed) { setData(value); setError(value.stale); }
      } catch {
        if (!disposed) setError(true);
      } finally {
        pending = false;
        if (!disposed) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initialGame.id]);
  const game = data?.game ?? initialGame;
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: NBA_TIMEZONE }).format(new Date(game.startsAt));
  const hasStats = data?.teams.some((team) => team.players.length > 0);
  return <dialog ref={dialog} className="player-dialog game-dialog" aria-label={`${game.away.name} at ${game.home.name} box score`}
    onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="dialog-topline"><span>Box score</span><Button variant="quiet" aria-label="Close box score" onClick={onClose}><PixelIcon name="close" size={16} /></Button></div>
    <div className="boxscore-scoreboard">
      {[game.away, game.home].map((team) => <div className="boxscore-side" key={team.id}>
        <NbaAvatar team={team} /><span>{team.name}</span><strong><MotionNumber>{team.score ?? "—"}</MotionNumber></strong>
      </div>)}
      <div className={`boxscore-status ${game.state === "live" ? "positive-text" : ""}`}>{date} · {gameLabel(game)}{game.state === "scheduled" ? " PT" : ""}</div>
    </div>
    {error && <p className="today-stale" role="status">{data ? "Stats may be out of date. Reconnecting…" : "Box score unavailable. Retrying…"}</p>}
    {loading ? <Empty>Loading box score…</Empty>
      : hasStats ? [game.away, game.home].map((team) => <BoxscoreTable key={team.id} team={team} box={data?.teams.find((box) => box.id === team.id)} />)
      : !error && <Empty>{game.state === "scheduled" ? "Stats appear when the game starts." : game.state === "postponed" || game.state === "cancelled" ? gameLabel(game) : "Box score not available yet."}</Empty>}
  </dialog>;
}
