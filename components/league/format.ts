import type { Player } from "@/lib/schema";
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
export function sortPlayers(players: Player[], sort: Sort) {
  return [...players].sort((a, b) => {
    const av = sort.key === "power" ? a.zTotal : a.stats[sort.key];
    const bv = sort.key === "power" ? b.zTotal : b.stats[sort.key];
    if (av == null) return bv == null ? a.name.localeCompare(b.name) : 1;
    if (bv == null) return -1;
    return (sort.descending ? bv - av : av - bv) || a.id - b.id;
  });
}
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
