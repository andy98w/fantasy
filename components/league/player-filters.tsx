import type { Team } from "@/lib/schema";
import { Button } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
export function PlayerFilters({
  teams,
  query,
  onQuery,
  position,
  onPosition,
  availability,
  onAvailability,
  count,
  onReset,
}: {
  teams: Team[];
  query: string;
  onQuery: (value: string) => void;
  position: string;
  onPosition: (value: string) => void;
  availability: string;
  onAvailability: (value: string) => void;
  count: number;
  onReset: () => void;
}) {
  return (
    <div className="filters">
      <label className="search-field">
        <PixelIcon name="search" size={14} />
        <input
          aria-label="Search players"
          placeholder="Search players"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <select
        aria-label="Availability"
        value={availability}
        onChange={(event) => onAvailability(event.target.value)}
      >
        <option value="all">All players</option>
        <option value="available">Available</option>
        <option value="rostered">Rostered</option>
        <optgroup label="Teams">
          {teams.map((team) => (
            <option key={team.id} value={`team:${team.id}`}>
              {team.name}
            </option>
          ))}
        </optgroup>
      </select>
      <select
        aria-label="Position"
        value={position}
        onChange={(event) => onPosition(event.target.value)}
      >
        <option value="all">All positions</option>
        {["PG", "SG", "SF", "PF", "C"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <span className="filter-count">
        {count} {count === 1 ? "player" : "players"}
      </span>
      {(query || position !== "all" || availability !== "all") && (
        <Button variant="quiet" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
