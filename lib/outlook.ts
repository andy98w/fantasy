import { CATEGORIES, type Player, type Snapshot } from "./schema";

export const OUTLOOK_MODEL = {
  version: "balanced-v1", basis: "Balanced outlook", validation: "Limited historical holdout: 13 veterans, one season; not a win probability",
  priorGames: 10, stocksPriorGames: 20, minutesPriorGames: 0, fgPriorAttempts: 400, ftPriorAttempts: 250,
};
const REQUIRED = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TO", "FGM", "FGA", "FTM", "FTA"];
const valid = (s: Player["stats"]) => REQUIRED.every(c => s[c] != null && Number.isFinite(s[c]) && s[c]! >= 0)
  && s.FGM! <= s.FGA! && s.FTM! <= s.FTA! && s["3PM"]! <= s.FGM!;
export type Outlook = {
  playerId: number; name: string; source: "blended" | "current_only" | "previous_only" | "unavailable";
  currentGames: number; priorSeason: number | null; priorGames: number;
  stats: Player["stats"] | null; currentWeights: Record<string, number>; warnings: string[];
};
export type OutlookConfig = Pick<typeof OUTLOOK_MODEL, "priorGames" | "stocksPriorGames" | "minutesPriorGames" | "fgPriorAttempts" | "ftPriorAttempts">;

export function playerOutlook(player: Player, season: number, config: OutlookConfig = OUTLOOK_MODEL): Outlook {
  const prior = player.previousSeason?.season === season - 1 && player.previousSeason.gamesPlayed > 0 && valid(player.previousSeason.stats) ? player.previousSeason : null;
  const n = Math.max(0, player.gamesPlayed);
  const result: Outlook = { playerId: player.id, name: player.name, source: "unavailable", currentGames: n,
    priorSeason: prior?.season ?? null, priorGames: prior?.gamesPlayed ?? 0, stats: null, currentWeights: {}, warnings: [] };
  if (n > 0 && !valid(player.stats)) { result.warnings.push("Incomplete current-season stats"); return result; }
  if (!n && !prior) { result.warnings.push("No usable current or previous-season baseline"); return result; }
  if (n < 15) result.warnings.push("Small current-season sample");
  if (!prior) result.warnings.push("No usable previous-season baseline; current stats only");
  else if (prior.gamesPlayed < 20) result.warnings.push("Limited previous-season sample");
  if (!prior || !n) {
    const source = prior ? prior.stats : player.stats;
    result.source = prior ? "previous_only" : "current_only";
    result.stats = { ...source, "FG%": source.FGA! > 0 ? source.FGM! / source.FGA! : null, "FT%": source.FTA! > 0 ? source.FTM! / source.FTA! : null };
    result.currentWeights = Object.fromEntries([...CATEGORIES, "MIN", "FGA", "FTA"].map(c => [c, prior ? 0 : 1]));
    return result;
  }
  const current = player.stats, historical = prior.stats;
  const weight = (cap: number) => n / (n + Math.min(prior.gamesPlayed, cap));
  const mix = (a: number, b: number, w: number) => a * w + b * (1 - w);
  const hasMinutes = current.MIN != null && current.MIN > 0 && historical.MIN != null && historical.MIN > 0;
  const minutesWeight = weight(config.minutesPriorGames);
  const minutes = hasMinutes ? mix(current.MIN!, historical.MIN!, minutesWeight) : null;
  if (!hasMinutes) result.warnings.push("Minutes unavailable; per-game blending used");
  else if (Math.abs(current.MIN! - historical.MIN!) >= Math.max(5, historical.MIN! * .2)) result.warnings.push("Minutes changed materially; role needs review");
  const stats: Player["stats"] = {};
  // Current minutes adapt immediately; per-minute production retains history, especially steals/blocks.
  for (const category of ["REB", "AST", "STL", "BLK", "3PM", "TO", "FGA", "FTA"]) {
    const w = weight(["STL", "BLK"].includes(category) ? config.stocksPriorGames : config.priorGames);
    result.currentWeights[category] = w;
    stats[category] = hasMinutes ? mix(current[category]! / current.MIN!, historical[category]! / historical.MIN!, w) * minutes!
      : mix(current[category]!, historical[category]!, w);
  }
  for (const [made, attempts, category, cap] of [["FGM", "FGA", "FG%", config.fgPriorAttempts], ["FTM", "FTA", "FT%", config.ftPriorAttempts]] as const) {
    const observed = current[attempts]! * n, pseudo = Math.min(historical[attempts]! * prior.gamesPlayed, cap);
    const w = observed + pseudo > 0 ? observed / (observed + pseudo) : 0;
    const rate = (observed + pseudo) > 0 ? (current[made]! * n + (historical[attempts]! > 0 ? historical[made]! / historical[attempts]! * pseudo : 0)) / (observed + pseudo) : null;
    result.currentWeights[category] = w;
    stats[made] = rate === null ? 0 : rate * stats[attempts]!;
    stats[category] = stats[attempts]! > 0 ? rate : null;
  }
  stats["3PM"] = Math.min(stats["3PM"]!, stats.FGM!);
  // Keep scoring and shooting internally consistent rather than predicting PTS independently.
  stats.PTS = 2 * stats.FGM! + stats["3PM"]! + stats.FTM!;
  if (minutes !== null) stats.MIN = minutes;
  result.currentWeights.MIN = minutesWeight;
  result.source = "blended"; result.stats = stats;
  return result;
}

/** One common reference pool for every team and every hypothetical trade. */
export function buildOutlook(data: Snapshot) {
  const estimates = new Map(data.players.map(p => [p.id, playerOutlook(p, data.league.season)]));
  const pool = data.players.filter(p => data.model.poolIds.includes(p.id) && estimates.get(p.id)?.stats);
  const stats = pool.map(p => estimates.get(p.id)!.stats!);
  const fga = stats.reduce((sum, s) => sum + s.FGA!, 0), fta = stats.reduce((sum, s) => sum + s.FTA!, 0);
  const fg = fga ? stats.reduce((sum, s) => sum + s.FGM!, 0) / fga : 0;
  const ft = fta ? stats.reduce((sum, s) => sum + s.FTM!, 0) / fta : 0;
  const vector = (s: Player["stats"], c: string) => c === "FG%" ? s.FGM! - fg * s.FGA! : c === "FT%" ? s.FTM! - ft * s.FTA! : s[c]!;
  const distributions = CATEGORIES.map(c => {
    const values = stats.map(s => vector(s, c)), mean = values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
    return { c, mean, sd: values.length ? Math.sqrt(values.reduce((sum,x) => sum + (x-mean)**2, 0) / values.length) : 0 };
  });
  const players = data.players.map(p => {
    const estimate = estimates.get(p.id)!;
    const contributions = estimate.stats && pool.length >= 2 && fga > 0 && fta > 0 ? Object.fromEntries(distributions.map(({c,mean,sd}) => [c,
      (sd > 1e-12 ? (vector(estimate.stats!, c) - mean) / sd : 0) * (c === "TO" ? -1 : 1)])) : {};
    return { ...p, stats: estimate.stats ?? {}, contributions,
      zTotal: Object.keys(contributions).length ? Object.values(contributions).reduce((a,b) => a+b, 0) : null,
      power: null, rank: null };
  });
  return { model: { ...OUTLOOK_MODEL, poolSize: pool.length, poolIds: pool.map(p => p.id) }, estimates, players };
}
export type OutlookContext = ReturnType<typeof buildOutlook>;
export function outlookRoster(roster: Player[], context: OutlookContext): Player[] {
  const players = new Map(context.players.map(p => [p.id, p]));
  return roster.map(p => ({ ...p, stats: players.get(p.id)?.stats ?? {}, contributions: players.get(p.id)?.contributions ?? {}, zTotal: players.get(p.id)?.zTotal ?? null, power: null, rank: null }));
}
