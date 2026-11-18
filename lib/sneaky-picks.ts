import type { Player } from "./schema";

/** Bounded discovery heuristic, not a prediction or a power/ownership ratio. */
export function sneakyScore(player: Pick<Player, "power" | "percentRostered">): number | null {
  const { power, percentRostered } = player;
  if (power == null || !Number.isFinite(power) || power < 0 || power > 100
    || percentRostered == null || !Number.isFinite(percentRostered) || percentRostered < 0 || percentRostered > 100) return null;
  return power * (1 - percentRostered / 100);
}

export function isSneakyPick(player: Player, maxRostered: number, minPower: number, minimumGames: number): boolean {
  return sneakyScore(player) !== null && player.gamesPlayed >= minimumGames
    && player.power! >= minPower && player.percentRostered! <= maxRostered;
}

export function rosteredPercent(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100) return "—";
  if (value > 0 && value < 0.1) return "<0.1%";
  if (value > 99.9 && value < 100) return ">99.9%";
  return `${Number(value.toFixed(1))}%`;
}
