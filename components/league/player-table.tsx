"use client";
import { useState } from "react";
import { matchesSearch } from "@/lib/table";
import { SortableHeader, TableToolbar } from "../ui/table-controls";
import { CATEGORIES, type Player, type Team } from "@/lib/schema";
import { PlayerAvatar, PowerBadge } from "./avatars";
import { ratingReason, stat, statusText, type Sort } from "./format";
import { PowerChange } from "./power-movers";
import { Empty } from "../ui/primitives";
export function PlayerTable({
  players,
  teams,
  minimumGames,
  sort,
  onSort,
  onSelect,
  compact = false,
  ownership = false,
  trends = false,
  baselineAt,
  searchable = true,
}: {
  players: Player[];
  teams: Team[];
  minimumGames: number;
  sort: Sort;
  onSort: (key: string) => void;
  onSelect: (player: Player) => void;
  compact?: boolean;
  ownership?: boolean;
  trends?: boolean;
  baselineAt?: string | null;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = players.filter(player => !searchable || matchesSearch(`${player.name} ${player.nbaTeam} ${player.position} ${statusText(player.status)}`, query));
  const categories = compact ? ["PTS", "REB", "AST"] : CATEGORIES;
  return (
    <>
    {searchable && <TableToolbar label="Search roster" query={query} onQuery={setQuery} />}
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Player statistics"
    >
      <table className={`data-table players-table ${compact ? "compact" : ""}`}>
        <thead>
          <tr>
            <SortableHeader column="name" sort={sort} onSort={onSort} descending={false} className="identity-col">Player</SortableHeader>
            <SortableHeader column="rank" sort={sort} onSort={onSort} descending={false}>Rank</SortableHeader>
            {["power", ...(trends ? ["powerChange7d"] : []), ...categories].map(key => <SortableHeader key={key} column={key} sort={sort} onSort={onSort} descending={key !== "TO"}>{key === "power" ? "Power" : key === "powerChange7d" ? "7d change" : key}</SortableHeader>)}
            <SortableHeader column={ownership ? "team" : "status"} sort={sort} onSort={onSort} descending={false}>{ownership ? "Team" : "Status"}</SortableHeader>
          </tr>
        </thead>
        <tbody>
          {visible.map((player) => (
            <tr key={player.id}>
              <td className="identity-col">
                <button className="identity" onClick={() => onSelect(player)}>
                  <PlayerAvatar player={player} />
                  <span>
                    <strong>{player.name}</strong>
                    <small>
                      {player.nbaTeam} / {player.position}
                      {player.slot === "BE"
                        ? " · Bench"
                        : player.slot === "IR"
                          ? " · IR"
                          : ""}
                    </small>
                  </span>
                </button>
              </td>
              <td
                className="rank-cell"
                title={
                  player.rank === null
                    ? ratingReason(player, minimumGames)
                    : "Overall player rank"
                }
              >
                {player.rank === null ? "—" : `#${player.rank}`}
              </td>
              <td>
                <PowerBadge
                  value={player.power}
                  reason={ratingReason(player, minimumGames)}
                />
              </td>
              {trends && <td><PowerChange player={player} baselineAt={baselineAt} /></td>}
              {categories.map((category) => (
                <td key={category}>{stat(player.stats[category], category)}</td>
              ))}
              <td>
                {ownership ? (
                  <span
                    className={
                      player.teamId === null ? "available-label" : "muted"
                    }
                  >
                    {teams.find((t) => t.id === player.teamId)?.abbrev ??
                      (player.availability === "WAIVERS"
                        ? "Waivers"
                        : player.availability === "FREEAGENT"
                          ? "FA"
                          : "—")}
                  </span>
                ) : (
                  <span
                    className={`status-label ${player.status === "ACTIVE" ? "" : "injured"}`}
                  >
                    {statusText(player.status)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!visible.length && (
        <Empty>No matching players.</Empty>
      )}
    </div>
    </>
  );
}
