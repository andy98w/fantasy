"use client";
import { Fragment, useState } from "react";
import { matchesSearch } from "@/lib/table";
import { SortableHeader, TableToolbar } from "../ui/table-controls";
import { CATEGORIES, type Player, type Team } from "@/lib/schema";
import { PlayerAvatar, PowerBadge } from "./avatars";
import { ratingReason, stat, statusText, type Sort } from "./format";
import { PlayerStatus } from "./player-status";
import { PowerChange } from "./power-movers";
import { Button, Empty } from "../ui/primitives";
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
  pinning,
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
  pinning?: {
    players: Player[];
    onToggle: (id: Player["id"]) => void;
    onClear: () => void;
  };
}) {
  const [query, setQuery] = useState("");
  const pinned = pinning?.players ?? [];
  const pinnedIds = new Set(pinned.map(player => player.id));
  const visible = players.filter(player => !pinnedIds.has(player.id) && (!searchable || matchesSearch(`${player.name} ${player.nbaTeam} ${player.position} ${statusText(player.status)}`, query)));
  const rows = [...pinned, ...visible];
  const categories = compact ? ["PTS", "REB", "AST"] : CATEGORIES;
  return (
    <>
    {searchable && <TableToolbar label="Search roster" query={query} onQuery={setQuery} />}
    {!!pinned.length && <div className="player-pins-toolbar">
      <span>{pinned.length} pinned <span className="muted">· Kept through filters</span></span>
      <Button variant="quiet" onClick={pinning?.onClear}>Clear pins</Button>
    </div>}
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Player statistics"
    >
      <table className={`data-table players-table ${compact ? "compact" : ""} ${pinning ? "pinnable" : ""}`}>
        <thead>
          <tr>
            <SortableHeader column="name" sort={sort} onSort={onSort} descending={false} className="identity-col">Player</SortableHeader>
            <SortableHeader column="status" sort={sort} onSort={onSort} descending={false}>Status</SortableHeader>
            <SortableHeader column="rank" sort={sort} onSort={onSort} descending={false}>Rank</SortableHeader>
            {["power", ...(trends ? ["powerChange7d"] : []), ...categories].map(key => <SortableHeader key={key} column={key} sort={sort} onSort={onSort} descending={key !== "TO"}>{key === "power" ? "Power" : key === "powerChange7d" ? "7d change" : key}</SortableHeader>)}
            {ownership && <SortableHeader column="team" sort={sort} onSort={onSort} descending={false}>Team</SortableHeader>}
          </tr>
        </thead>
        <tbody>
          {rows.map((player, index) => (
            <Fragment key={player.id}>
            {!!pinned.length && index === pinned.length && <tr className="player-pins-divider">
              <th colSpan={4 + categories.length + Number(trends) + Number(ownership)}>Search results</th>
            </tr>}
            <tr className={pinnedIds.has(player.id) ? "player-pinned" : undefined}>
              <td className="identity-col">
                <div className="player-row-identity">
                {pinning && <button type="button" className="player-pin"
                  aria-label={`${pinnedIds.has(player.id) ? "Unpin" : "Pin"} ${player.name}`}
                  title={`${pinnedIds.has(player.id) ? "Unpin" : "Pin"} ${player.name}`}
                  aria-pressed={pinnedIds.has(player.id)} onClick={() => pinning.onToggle(player.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M8 3h8M9 3v7l-3 3v3h12v-3l-3-3V3M12 16v6" />
                  </svg>
                </button>}
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
                </div>
              </td>
              <td><PlayerStatus status={player.status} /></td>
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
              {ownership && <td>
                <span className={player.teamId === null ? "available-label" : "muted"}>
                  {teams.find((t) => t.id === player.teamId)?.abbrev ??
                    (player.availability === "WAIVERS" ? "Waivers" : player.availability === "FREEAGENT" ? "FA" : "—")}
                </span>
              </td>}
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {!visible.length && (
        <Empty>{pinned.length ? "No other matching players." : "No matching players."}</Empty>
      )}
    </div>
    </>
  );
}
