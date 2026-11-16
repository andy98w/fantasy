"use client";
import { StickyTable } from "../ui/sticky-table";

import { useEffect, useRef, useState } from "react";
import { BOX_COLUMNS, type BoxPlayer, type BoxTeam, type GameBoxscore } from "@/lib/game-boxscore";
import { gameLabel, NBA_TIMEZONE, type NbaGame, type NbaTeam, type TodayData } from "@/lib/nba";
import { NbaAvatar, PlayerAvatar } from "./avatars";
import { Button, Empty, Tabs } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
import { SortableHeader, TableToolbar, TableEmpty, useTableControls } from "../ui/table-controls";
import { Select } from "../ui/select";
import { statSortValue } from "@/lib/table";
import type { Player, Snapshot } from "@/lib/schema";
import { statusText } from "./format";
import { PlayerStatus } from "./player-status";
import { ShotChart } from "./shot-chart";
import { MotionNumber } from "../ui/motion";
import { PlayByPlay } from "./play-by-play";
import { PlayerDialog } from "./player-dialog";

type CurrentPlayers = Pick<Player, "id" | "status">[];

export function BoxscoreTable({ team, box, players = [], showOnCourt = false, onPlayer }: { team: NbaTeam; box?: BoxTeam; players?: CurrentPlayers; showOnCourt?: boolean; onPlayer?: (player: BoxPlayer, trigger: HTMLButtonElement) => void }) {
  const statuses = new Map(players.map(player => [String(player.id), player.status]));
  const [role, setRole] = useState("all");
  const control = useTableControls((box?.players ?? []).filter(player => role === "all" || (role === "starters" ? player.starter : role === "bench" ? !player.starter : !player.didNotPlay)), {
    search: player => `${player.name} ${statusText(statuses.get(String(player.id)) ?? "UNKNOWN")} ${player.didNotPlay ? "DNP " + player.reason : ""}`,
    value: (player, key) => key === "name" ? player.name : key === "status" ? statusText(statuses.get(String(player.id)) ?? "UNKNOWN") : player.didNotPlay ? null : statSortValue(player.stats[key]),
  });
  return <section className="boxscore-team" aria-label={`${team.name} box score`}>
    <h3><NbaAvatar team={team} />{team.name}</h3>
    {!box?.players.length ? <Empty>Box score not available yet.</Empty> :
      <><TableToolbar label={`Search ${team.abbrev} players`} query={control.query} onQuery={control.setQuery}>
        <Select label={`${team.abbrev} lineup`} value={role} onChange={setRole} options={[{ value: "all", label: "All players" }, { value: "starters", label: "Starters" }, { value: "bench", label: "Bench" }, { value: "played", label: "Played" }]} />
      </TableToolbar><div className="table-scroll" tabIndex={0} role="region" aria-label={`${team.abbrev} player stats`}>
        <StickyTable className="data-table boxscore-table">
          <thead><tr><SortableHeader column="name" sort={control.sort} onSort={control.onSort} descending={false}>Player</SortableHeader><SortableHeader column="status" sort={control.sort} onSort={control.onSort} descending={false}>Current status</SortableHeader>{BOX_COLUMNS.map(([key, label]) => <SortableHeader key={key} column={key} sort={control.sort} onSort={control.onSort} descending={key !== "turnovers"} title={key.includes("Made-") ? "Sort by makes, then attempts" : undefined}>{label}</SortableHeader>)}</tr></thead>
          <tbody>{!control.rows.length ? <TableEmpty columns={BOX_COLUMNS.length + 2} /> : control.sort ? <BoxscoreGroup players={control.rows} statuses={statuses} showOnCourt={showOnCourt} onPlayer={onPlayer} /> : [true, false].map((starter) => {
            const players = control.rows.filter((player) => player.starter === starter);
            return players.length > 0 && <BoxscoreGroup key={String(starter)} players={players} statuses={statuses} showOnCourt={showOnCourt} onPlayer={onPlayer} label={starter ? "Starters" : "Bench"} />;
          })}</tbody>
          {Object.keys(box.totals).length > 0 && <tfoot><tr><th scope="row">Team total</th><td />{BOX_COLUMNS.map(([key]) => <td key={key}>{box.totals[key] ?? "—"}</td>)}</tr></tfoot>}
        </StickyTable>
      </div></>}
  </section>;
}

function BoxscoreGroup({ players, statuses, label, showOnCourt, onPlayer }: { players: BoxTeam["players"]; statuses: Map<string, string>; label?: string; showOnCourt: boolean; onPlayer?: (player: BoxPlayer, trigger: HTMLButtonElement) => void }) {
  return <>
    {label && <tr className="boxscore-group"><th colSpan={BOX_COLUMNS.length + 2} scope="rowgroup">{label}</th></tr>}
    {players.map((player) => <tr key={player.id} className={player.didNotPlay ? "boxscore-dnp" : undefined}>
      <th scope="row"><span className="boxscore-player">{onPlayer ? <button type="button" className="boxscore-profile-link" aria-label={`View ${player.name} player details`} aria-haspopup="dialog" onClick={event => onPlayer(player, event.currentTarget)}><PlayerAvatar player={player} /><span>{player.name}</span></button> : <><PlayerAvatar player={player} /><span>{player.name}</span></>}{showOnCourt && player.onCourt && <span className="on-court-badge">On court</span>}</span></th>
      <td><PlayerStatus status={statuses.get(String(player.id))} /></td>
      {player.didNotPlay ? <td colSpan={BOX_COLUMNS.length} className="boxscore-reason">DNP{player.reason ? ` · ${player.reason.toLowerCase()}` : ""}</td>
        : BOX_COLUMNS.map(([key]) => <td key={key}>{player.stats[key] ?? "—"}</td>)}
    </tr>)}
  </>;
}

export function GameDialog({ game: initialGame, snapshot, today, onClose }: { game: NbaGame; snapshot: Snapshot; today?: TodayData; onClose: () => void }) {
  const players = snapshot.players;
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string; nbaTeam: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const profileReturn = useRef<{ trigger: HTMLButtonElement; scrollTop: number } | null>(null);
  useEffect(() => {
    if (selectedPlayer || !profileReturn.current) return;
    const { trigger, scrollTop } = profileReturn.current;
    profileReturn.current = null;
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
    if (dialog.current) dialog.current.scrollTop = scrollTop;
  }, [selectedPlayer]);
  const [data, setData] = useState<GameBoxscore | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"box" | "plays">("box");
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
  return <><dialog ref={dialog} className="player-dialog game-dialog" aria-label={`${game.away.name} at ${game.home.name} game details`}
    onCancel={(event) => { event.stopPropagation(); onClose(); }} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="dialog-topline" data-sticky-table-bar><span>Game details</span><Button variant="quiet" aria-label="Close game details" onClick={onClose}><PixelIcon name="close" size={16} /></Button></div>
    <div className="boxscore-scoreboard">
      {[game.away, game.home].map((team) => <div className="boxscore-side" key={team.id}>
        <NbaAvatar team={team} /><span>{team.name}</span><strong><MotionNumber>{team.score ?? "—"}</MotionNumber></strong>
      </div>)}
      <div className={`boxscore-status ${game.state === "live" ? "positive-text" : ""}`}>{date} · {gameLabel(game)}{game.state === "scheduled" ? " PT" : ""}</div>
    </div>
    <div className="game-view-tabs"><Tabs label="Game details" value={view} onChange={setView} options={[{ value: "box", label: "Box score" }, { value: "plays", label: "Play-by-play" }]} /></div>
    {error && <p className="today-stale" role="status">{data ? "Game data may be out of date. Reconnecting…" : "Game data unavailable. Retrying…"}</p>}
    {view === "plays" ? loading ? <Empty>Loading play-by-play…</Empty> : <PlayByPlay key={game.id} report={data?.playByPlay} game={game} /> : <>
    {loading ? <Empty>Loading box score…</Empty>
      : hasStats ? [game.away, game.home].map((team) => <BoxscoreTable key={team.id} team={team} players={players} onPlayer={(player, trigger) => { profileReturn.current = { trigger, scrollTop: dialog.current?.scrollTop ?? 0 }; setSelectedPlayer({ id: player.id, name: player.name, nbaTeam: team.abbrev }); }} showOnCourt={game.state === "live" && !error && !data?.stale} box={data?.teams.find((box) => box.id === team.id)} />)
      : !error && <Empty>{game.state === "scheduled" ? "Stats appear when the game starts." : game.state === "postponed" || game.state === "cancelled" ? gameLabel(game) : "Box score not available yet."}</Empty>}
    {data?.shotReport && <ShotChart report={data.shotReport} teams={[game.away, game.home]} />}
    </>}
  </dialog>
    {selectedPlayer && <PlayerDialog key={selectedPlayer.id} player={players.find(player => player.id === selectedPlayer.id) ?? null}
      identity={selectedPlayer} data={snapshot} today={today} gameBoxscore={data ? { ...data, stale: data.stale || error } : undefined} onClose={() => setSelectedPlayer(null)} />}
  </>;
}
