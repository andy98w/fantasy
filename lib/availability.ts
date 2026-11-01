import type { Player } from "./schema";

// ESPN supplies a current status, not game-specific return dates or probabilities.
export const isUnavailable = (player: Player) =>
  ["OUT", "INJURY_RESERVE", "SUSPENSION", "SUSPENDED"].includes(player.status);
export const isUncertain = (player: Player) => player.status !== "ACTIVE" && !isUnavailable(player);
export type AvailabilityScenario = "conservative" | "if_available";
export const availabilityReason = (player: Player) => player.slot === "IR" ? "IR activation required" :
  isUnavailable(player) ? `${player.status}: return date unknown` : `${player.status}: participation uncertain`;
