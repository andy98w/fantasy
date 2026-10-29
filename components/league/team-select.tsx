import type { Team } from "@/lib/schema";
import { Select, type SelectOption } from "../ui/select";
import { TeamAvatar } from "./avatars";

export function teamOptions(teams: Team[], prefix = ""): SelectOption[] {
  return teams.map((team) => ({
    value: `${prefix}${team.id}`,
    label: team.name,
    icon: <TeamAvatar team={team} />,
  }));
}

export function TeamSelect({
  teams,
  label,
  value,
  onChange,
  allLabel = "All teams",
}: {
  teams: Team[];
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      className="team-select"
      options={[{ value: "all", label: allLabel }, ...teamOptions(teams)]}
    />
  );
}
