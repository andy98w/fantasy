import { compareTableValues } from "@/lib/table";
import type { Player, Team } from "@/lib/schema";
export const stat = (value: number | null | undefined, category: string) =>
  value == null
    ? "—"
    : category.includes("%")
      ? `${(value * 100).toFixed(1)}%`
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(1);
export const initials = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("");
export const statusText = (status: string) =>
  ({
    ACTIVE: "Healthy",
    DAY_TO_DAY: "Day to day",
    OUT: "Out",
    INJURY_RESERVE: "Injured",
  })[status] ?? status.replaceAll("_", " ").toLowerCase();
export const ratingReason = (player: Player, minimum: number) =>
  player.gamesPlayed < minimum
    ? `${player.gamesPlayed}/${minimum} games required`
    : "Incomplete statistics";
export type Sort = { key: string; descending: boolean };
export function sortPlayers(players: Player[], sort: Sort, teams: Team[] = []) {
  const value = (p: Player) => sort.key === "name" ? p.name : sort.key === "rank" ? p.rank : sort.key === "team" ? teams.find(t => t.id === p.teamId)?.abbrev ?? (p.availability === "WAIVERS" ? "Waivers" : p.availability === "FREEAGENT" ? "FA" : null) : sort.key === "status" ? statusText(p.status) : sort.key === "power" ? p.zTotal : sort.key === "powerChange7d" ? p.powerChange7d : p.stats[sort.key];
  return [...players].sort((a, b) => compareTableValues(value(a), value(b), sort.descending) || a.id - b.id);
}
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

export function signedZ(value: number) {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

export const categorySearch = (category: string) => `${category} ${{ PTS: "points", REB: "rebounds", AST: "assists", STL: "steals", BLK: "blocks", "3PM": "threes three pointers", "FG%": "field goal percentage", "FT%": "free throw percentage", TO: "turnovers" }[category] ?? ""}`;
