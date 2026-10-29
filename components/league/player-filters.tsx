import type { Team } from "@/lib/schema";
import { Button, Toolbar, ResultCount } from "../ui/primitives";
import { Select } from "../ui/select";
import { SearchField } from "../ui/search-field";
import { teamOptions } from "./team-select";
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
    <Toolbar filters>
      <SearchField label="Search players" value={query} onChange={onQuery} />
      <Select
        label="Availability"
        value={availability}
        onChange={onAvailability}
        options={[
          { value: "all", label: "All players" },
          { value: "available", label: "Available" },
          { value: "rostered", label: "Rostered" },
        ]}
        groups={[{ label: "Teams", options: teamOptions(teams, "team:") }]}
      />
      <Select
        label="Position"
        value={position}
        onChange={onPosition}
        className="position-select"
        options={[
          { value: "all", label: "All positions" },
          ...["PG", "SG", "SF", "PF", "C"].map((value) => ({
            value,
            label: value,
          })),
        ]}
      />
      <ResultCount count={count} singular="player" />
      {(query || position !== "all" || availability !== "all") && (
        <Button variant="quiet" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </Toolbar>
  );
}
