import { CATEGORIES, type Category, type Snapshot, type WeeklyPlayer } from "./schema";
type Matchup = Snapshot["matchups"][number];
export function leagueAwards(matchups: Matchup[]) {
  const sides = matchups.flatMap(m => [m.home, m.away]);
  if (new Set(sides.map(s => s.teamId)).size !== sides.length || sides.length < 2) return [];
  const definitions = [
    { name: "Block Party", stat: "BLK", label: "blocks" },
    { name: "Dime Dealer", stat: "AST", label: "assists" },
    { name: "Board Boss", stat: "REB", label: "rebounds" },
    { name: "Hot Hand", stat: "PTS", label: "points" },
    { name: "Brick Factory", stat: "MISSES", label: "missed field goals" },
    { name: "Turnover Machine", stat: "TO", label: "turnovers" },
  ];
  return definitions.flatMap(award => {
    const values = sides.map(side => ({ teamId: side.teamId, value: award.stat === "MISSES"
      ? side.stats.FGA != null && side.stats.FGM != null ? side.stats.FGA - side.stats.FGM : null
      : side.stats[award.stat] }));
    // Don't declare a league leader from incomplete league data or an all-zero week.
    if (values.some(v => v.value == null || !Number.isFinite(v.value) || v.value < 0)) return [];
    const value = Math.max(...values.map(v => v.value!));
    if (value <= 0) return [];
    return [{ ...award, value, teamIds: values.filter(v => v.value === value).map(v => v.teamId) }];
  });
}
const required = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TO", "FGM", "FGA", "FTM", "FTA", "GP"];
export function weeklyMVPs(matchups: Matchup[]) {
  if (!matchups.length || matchups.some(m => !m.home.performanceComplete || !m.away.performanceComplete)) return [];
  const pool = matchups.flatMap(m => [m.home, m.away].flatMap(side => side.performanceComplete ? side.performers
    .filter(p => (p.stats.GP ?? 0) > 0 && required.every(k => p.stats[k] != null && Number.isFinite(p.stats[k])))
    .map(player => ({ key: `${m.id}:${side.teamId}:${player.playerId}`, teamId: side.teamId, matchupId: m.id, player })) : []));
  if (pool.length < 2) return [];
  const baseline = (made: string, attempts: string) => {
    const volume = pool.reduce((sum, p) => sum + p.player.stats[attempts]!, 0);
    return volume ? pool.reduce((sum, p) => sum + p.player.stats[made]!, 0) / volume : 0;
  };
  const fg = baseline("FGM", "FGA"), ft = baseline("FTM", "FTA");
  const values = (p: WeeklyPlayer, category: Category) => category === "FG%" ? p.stats.FGM! - fg * p.stats.FGA!
    : category === "FT%" ? p.stats.FTM! - ft * p.stats.FTA! : p.stats[category]!;
  const distributions = Object.fromEntries(CATEGORIES.map(category => {
    const xs = pool.map(p => values(p.player, category)), mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    return [category, { mean, sd }];
  }));
  return pool.map(p => {
    const contributions = Object.fromEntries(CATEGORIES.map(category => {
      const { mean, sd } = distributions[category];
      return [category, sd ? (values(p.player, category) - mean) / sd * (category === "TO" ? -1 : 1) : 0];
    })) as Record<Category, number>;
    const score = Math.round(Object.values(contributions).reduce((s, x) => s + x, 0) * 1000) / 1000;
    return { ...p, score, contributions };
  });
}
export function teamMVPs(ratings: ReturnType<typeof weeklyMVPs>, matchupId: number, teamId: number) {
  const team = ratings.filter(p => p.matchupId === matchupId && p.teamId === teamId);
  const best = Math.max(...team.map(p => p.score));
  return team.filter(p => p.score === best);
}
