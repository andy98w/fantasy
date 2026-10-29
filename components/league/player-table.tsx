"use client";
import { CATEGORIES, type Player, type Team } from "@/lib/schema";
import { PlayerAvatar, PowerBadge } from "./avatars";
import { ratingReason, stat, statusText, type Sort } from "./format";
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
}: {
  players: Player[];
  teams: Team[];
  minimumGames: number;
  sort: Sort;
  onSort: (key: string) => void;
  onSelect: (player: Player) => void;
  compact?: boolean;
  ownership?: boolean;
}) {
  const categories = compact ? ["PTS", "REB", "AST"] : CATEGORIES;
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Player statistics"
    >
      <table className={`data-table players-table ${compact ? "compact" : ""}`}>
        <thead>
          <tr>
            <th className="identity-col">Player</th>
            <th title="Overall player rank">Rank</th>
            {["power", ...categories].map((key) => (
              <th
                key={key}
                aria-sort={
                  sort.key === key
                    ? sort.descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
              >
                <button onClick={() => onSort(key)}>
                  {key === "power" ? "Power" : key}
                  <span className="sort-arrow" aria-hidden="true">
                    {sort.key === key ? (sort.descending ? "↓" : "↑") : ""}
                  </span>
                </button>
              </th>
            ))}
            <th>{ownership ? "Team" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
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
      {!players.length && (
        <Empty>No matching players. Clear a filter to see more.</Empty>
      )}
    </div>
  );
}
