"use client";
import { StickyTable } from "../ui/sticky-table";

import { useState } from "react";
import { CATEGORIES, type Player, type Snapshot, type Team } from "@/lib/schema";
import { matchupPlayers, todayMatchupPlayers, matchupGameLabel, matchupPlayerGroups, matchupLineupSlot, matchupPlayerDay } from "@/lib/matchup-players";
import { gameLabel, nbaDate, type TodayData } from "@/lib/nba";
import { PlayerAvatar } from "./avatars";
import { PlayerStatus } from "./player-status";
import { stat, statusText } from "./format";
import { TeamSelect } from "./team-select";
import { Select } from "../ui/select";
import { SortableHeader, useTableControls } from "../ui/table-controls";
import { SearchField } from "../ui/search-field";
import { Empty, Toolbar, Tabs } from "../ui/primitives";

export function MatchupPlayers({ matchup, teams, players, today, onPlayer }: {
  matchup: Snapshot["matchups"][number]; teams: Team[]; players: Player[]; today?: TodayData; onPlayer: (player: Player) => void;
}) {
  const [period, setPeriod] = useState<"week" | "today">("today");
  const date = nbaDate(new Date());
  const daily = period === "today";
  const slate = matchupPlayerDay(today, date);
  const slateDate = slate?.date ?? date;
  const recap = slateDate !== date;
  const yesterday = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const dayLabel = recap ? slateDate === yesterday ? "Yesterday" : "Last game day" : "Today";
  const displayDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${slateDate}T12:00:00Z`));
  const unavailable = !slate || slate.status === "error";
  const stale = slate?.status === "stale";
  const source = daily ? todayMatchupPlayers(matchup, players, slate, slateDate) : matchupPlayers(matchup, players);
  const [team, setTeam] = useState("all");
  const [category, setCategory] = useState("all");
  const control = useTableControls(source.filter(row => team === "all" || String(row.teamId) === team), {
    initialSort: { key: "PTS", descending: true },
    search: row => `${row.name} ${daily ? matchupLineupSlot(row.player?.slot) : ""} ${row.game ? matchupGameLabel(row.game, stale) : ""} ${statusText(row.player?.status ?? "UNKNOWN")} ${teams.find(t => t.id === row.teamId)?.name ?? ""}`,
    value: (row, key) => key === "name" ? row.name : key === "status" ? statusText(row.player?.status ?? "UNKNOWN") : key === "game" ? row.game ? matchupGameLabel(row.game, stale) : null : key === "team" ? teams.find(t => t.id === row.teamId)?.name : row.stats[key],
  });
  const rows = control.rows;
  const groups = matchupPlayerGroups(rows, daily, recap);
  const columns = [daily ? "MIN" : "GP", ...(category === "all" ? CATEGORIES : [category])];
  return <section className="matchup-players" aria-label="Matchup player statistics">
    <div className="section-heading"><h2>Players</h2><span>{daily ? `${recap ? displayDate : "Today"} · NBA stats · PT` : `Week ${matchup.period} · Lineup totals`}</span></div>
    <div className="matchup-period"><Tabs label="Player stats period" value={period} onChange={value => { setPeriod(value); if (control.sort?.key === "MIN" || control.sort?.key === "GP" || control.sort?.key === "game") control.onSort("PTS", true); }} options={[{ value: "week", label: "Week" }, { value: "today", label: dayLabel }]} /></div>
    {daily && !unavailable && (stale || slate?.boxscoreStatus === "partial" || slate?.boxscoreStatus === "error") && <p className="today-stale" role="status">{stale ? "Showing saved game stats." : "Some game stats are unavailable."}</p>}
    <Toolbar filters>
      <SearchField label="Search matchup players" value={control.query} onChange={control.setQuery} />
      <TeamSelect label="Filter matchup team" teams={teams} value={team} onChange={setTeam} allLabel="Both teams" />
      <Select label="Filter category" value={category} onChange={value => {
        setCategory(value);
        if (value !== "all") control.onSort(value, value !== "TO");
      }} options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map(value => ({ value, label: value }))]} />
    </Toolbar>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={daily ? `${dayLabel} player table` : "Weekly player table"}>
      <StickyTable className="data-table weekly-players-table">
        <thead><tr><SortableHeader column="name" sort={control.sort} onSort={control.onSort} descending={false} className="identity-col">Player</SortableHeader><SortableHeader column="status" sort={control.sort} onSort={control.onSort} descending={false}>Current status</SortableHeader><SortableHeader column="team" sort={control.sort} onSort={control.onSort} descending={false}>Team</SortableHeader>{daily && <SortableHeader column="game" sort={control.sort} onSort={control.onSort} descending={false}>Game</SortableHeader>}{columns.map(key => <SortableHeader key={key} column={key} sort={control.sort} onSort={control.onSort} descending={key !== "TO"}>{key}</SortableHeader>)}</tr></thead>
        {groups.map(group => <tbody key={group.key}>
          {group.label && <tr className="matchup-lineup-divider"><th scope="rowgroup" colSpan={columns.length + 4} title={recap ? "Current roster slots, not historical lineup credit." : "Based on current fantasy roster slots. Bench and IR NBA stats are shown for reference."}>{group.label}</th></tr>}
          {group.rows.map(row => <tr key={`${row.teamId}:${row.playerId}:${row.game?.id ?? "week"}`}>
          <td className="identity-col"><button className="identity" disabled={!row.player} onClick={() => row.player && onPlayer(row.player)}>
            <PlayerAvatar player={{ id: row.playerId, name: row.name }} /><span><strong>{row.name}</strong><small>{row.player ? `${row.player.nbaTeam} / ${row.player.position}` : ""}{daily && ["bench", "ir"].includes(matchupLineupSlot(row.player?.slot)) && <span className="matchup-slot-label"> · {matchupLineupSlot(row.player?.slot) === "bench" ? "Bench" : "IR"}{recap ? " now" : ""}</span>}</small></span>
          </button></td>
          <td><PlayerStatus status={row.player?.status} /></td>
          <td title={teams.find(t => t.id === row.teamId)?.name}>{teams.find(t => t.id === row.teamId)?.abbrev}</td>
          {daily && <td>{row.game && <span className={`matchup-game-state ${row.game.state === "live" && !stale ? "live" : ""}`} title="NBA game status"><span>{matchupGameLabel(row.game, stale)}</span>{row.game.state === "live" && <small>{gameLabel(row.game)}</small>}</span>}</td>}
          {columns.map(key => <td key={key}>{stat(row.stats[key], key)}{(key === "FG%" || key === "FT%") && row.stats[key === "FG%" ? "FGA" : "FTA"] != null && <small className="weekly-shooting">{stat(row.stats[key === "FG%" ? "FGM" : "FTM"], "")}/{stat(row.stats[key === "FG%" ? "FGA" : "FTA"], "")}</small>}</td>)}
        </tr>)}</tbody>)}
      </StickyTable>
      {!rows.length && <Empty>{daily ? unavailable ? "Game stats are unavailable. Retrying automatically." : source.length ? "No players match these filters." : `No players from these teams have a game ${recap ? `on ${displayDate}` : "today"}.` : "No players for this matchup."}</Empty>}
    </div>
  </section>;
}
