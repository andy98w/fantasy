"use client";

import { useState } from "react";
import { CATEGORIES, type Player, type Snapshot, type Team } from "@/lib/schema";
import { matchupPlayers, sortMatchupPlayers } from "@/lib/matchup-players";
import { PlayerAvatar } from "./avatars";
import { stat, type Sort } from "./format";
import { TeamSelect } from "./team-select";
import { Select } from "../ui/select";
import { Empty, Toolbar } from "../ui/primitives";

export function MatchupPlayers({ matchup, teams, players, onPlayer }: {
  matchup: Snapshot["matchups"][number]; teams: Team[]; players: Player[]; onPlayer: (player: Player) => void;
}) {
  const [team, setTeam] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "PTS", descending: true });
  const rows = sortMatchupPlayers(matchupPlayers(matchup, players).filter(row => team === "all" || String(row.teamId) === team), sort.key, sort.descending);
  const columns = ["GP", ...(category === "all" ? CATEGORIES : [category])];
  function changeSort(key: string) {
    setSort(previous => ({ key, descending: previous.key === key ? !previous.descending : key !== "TO" }));
  }
  return <section className="matchup-players" aria-label="Weekly player statistics">
    <div className="section-heading"><h2>Players</h2><span>Week {matchup.period} · Lineup totals</span></div>
    <Toolbar filters>
      <TeamSelect label="Filter matchup team" teams={teams} value={team} onChange={setTeam} allLabel="Both teams" />
      <Select label="Filter category" value={category} onChange={value => {
        setCategory(value);
        if (value !== "all") setSort({ key: value, descending: value !== "TO" });
      }} options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map(value => ({ value, label: value }))]} />
    </Toolbar>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly player table">
      <table className="data-table weekly-players-table">
        <thead><tr><th className="identity-col">Player</th><th>Team</th>{columns.map(key => <th key={key} aria-sort={sort.key === key ? sort.descending ? "descending" : "ascending" : "none"}>
          <button onClick={() => changeSort(key)}>{key}<span className="sort-arrow" aria-hidden="true">{sort.key === key ? sort.descending ? "↓" : "↑" : ""}</span></button>
        </th>)}</tr></thead>
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
