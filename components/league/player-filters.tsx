import type { Team } from "@/lib/schema";
import { Button, Toolbar, ResultCount } from "../ui/primitives";
import { Select } from "../ui/select";
import { SearchField } from "../ui/search-field";
import { teamOptions } from "./team-select";
const nbaTeamNames: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
  FA: "No NBA team",
};

export function PlayerFilters({
  teams,
  query,
  onQuery,
  position,
  onPosition,
  nbaTeam,
  nbaTeams,
  onNbaTeam,
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
  nbaTeam: string;
  nbaTeams: string[];
  onNbaTeam: (value: string) => void;
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
        groups={[{ label: "Fantasy teams", options: teamOptions(teams, "team:") }]}
      />
      <Select
        label="NBA team"
        value={nbaTeam}
        onChange={onNbaTeam}
        options={[
          { value: "all", label: "All NBA teams" },
          ...nbaTeams.map(value => ({ value, label: nbaTeamNames[value] ?? value }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ]}
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
      {(query || position !== "all" || nbaTeam !== "all" || availability !== "all") && (
        <Button variant="quiet" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </Toolbar>
  );
}
