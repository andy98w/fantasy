"use client";

import { useState } from "react";
import { CATEGORIES, type Player, type Snapshot, type Team } from "@/lib/schema";
import { matchupPlayers } from "@/lib/matchup-players";
import { PlayerAvatar } from "./avatars";
import { stat } from "./format";
import { TeamSelect } from "./team-select";
import { Select } from "../ui/select";
import { SortableHeader, useTableControls } from "../ui/table-controls";
import { SearchField } from "../ui/search-field";
import { Empty, Toolbar } from "../ui/primitives";

export function MatchupPlayers({ matchup, teams, players, onPlayer }: {
  matchup: Snapshot["matchups"][number]; teams: Team[]; players: Player[]; onPlayer: (player: Player) => void;
}) {
  const [team, setTeam] = useState("all");
  const [category, setCategory] = useState("all");
  const control = useTableControls(matchupPlayers(matchup, players).filter(row => team === "all" || String(row.teamId) === team), {
    initialSort: { key: "PTS", descending: true },
    search: row => `${row.name} ${teams.find(t => t.id === row.teamId)?.name ?? ""}`,
    value: (row, key) => key === "name" ? row.name : key === "team" ? teams.find(t => t.id === row.teamId)?.name : row.stats[key],
  });
  const rows = control.rows;
  const columns = ["GP", ...(category === "all" ? CATEGORIES : [category])];
  return <section className="matchup-players" aria-label="Weekly player statistics">
    <div className="section-heading"><h2>Players</h2><span>Week {matchup.period} · Lineup totals</span></div>
    <Toolbar filters>
      <SearchField label="Search matchup players" value={control.query} onChange={control.setQuery} />
      <TeamSelect label="Filter matchup team" teams={teams} value={team} onChange={setTeam} allLabel="Both teams" />
      <Select label="Filter category" value={category} onChange={value => {
        setCategory(value);
        if (value !== "all") control.onSort(value, value !== "TO");
      }} options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map(value => ({ value, label: value }))]} />
    </Toolbar>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly player table">
      <table className="data-table weekly-players-table">
        <thead><tr><SortableHeader column="name" sort={control.sort} onSort={control.onSort} descending={false} className="identity-col">Player</SortableHeader><SortableHeader column="team" sort={control.sort} onSort={control.onSort} descending={false}>Team</SortableHeader>{columns.map(key => <SortableHeader key={key} column={key} sort={control.sort} onSort={control.onSort} descending={key !== "TO"}>{key}</SortableHeader>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.teamId}:${row.playerId}`}>
          <td className="identity-col"><button className="identity" disabled={!row.player} onClick={() => row.player && onPlayer(row.player)}>
            <PlayerAvatar player={{ id: row.playerId, name: row.name }} /><span><strong>{row.name}</strong><small>{row.player ? `${row.player.nbaTeam} / ${row.player.position}` : ""}</small></span>
          </button></td>
          <td title={teams.find(t => t.id === row.teamId)?.name}>{teams.find(t => t.id === row.teamId)?.abbrev}</td>
          {columns.map(key => <td key={key}>{stat(row.stats[key], key)}{(key === "FG%" || key === "FT%") && row.stats[key === "FG%" ? "FGA" : "FTA"] != null && <small className="weekly-shooting">{stat(row.stats[key === "FG%" ? "FGM" : "FTM"], "")}/{stat(row.stats[key === "FG%" ? "FGA" : "FTA"], "")}</small>}</td>)}
        </tr>)}</tbody>
      </table>
      {!rows.length && <Empty>No players for this matchup.</Empty>}
    </div>
  </section>;
}
