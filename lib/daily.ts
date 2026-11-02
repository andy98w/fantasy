import { z } from "zod";
import { CATEGORIES, type Player, type Snapshot } from "./schema";
import { nbaDate, type NbaGame } from "./nba";
export type DailyLine = { playerId: number; gameId: string; minutes: number; stats: Record<string, number> };
const box = z.object({
  header: z.object({ id: z.string() }),
  boxscore: z.object({ players: z.array(z.object({
    team: z.object({ id: z.string() }),
    statistics: z.array(z.object({ keys: z.array(z.string()), athletes: z.array(z.object({
      athlete: z.object({ id: z.string() }), didNotPlay: z.boolean().optional(), stats: z.array(z.string()),
    })) })),
  })).length(2) }),
});
const counts = { points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK", turnovers: "TO" };
const shots = { "fieldGoalsMade-fieldGoalsAttempted": ["FGM", "FGA"], "freeThrowsMade-freeThrowsAttempted": ["FTM", "FTA"], "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["3PM", "3PA"] };
export function normalizeBoxscore(payload: unknown, game: NbaGame): DailyLine[] {
  const parsed = box.parse(payload);
  if (parsed.header.id !== game.id || new Set(parsed.boxscore.players.map(t => t.team.id)).size !== 2 ||
      parsed.boxscore.players.some(t => ![game.home.id, game.away.id].includes(t.team.id))) throw new Error("Wrong box score");
  const lines: DailyLine[] = [], seen = new Set<number>();
  for (const team of parsed.boxscore.players) for (const group of team.statistics) for (const row of group.athletes) {
    if (row.didNotPlay) continue;
    const values = Object.fromEntries(group.keys.map((key, i) => [key, row.stats[i]]));
    const minute = values.minutes?.match(/^(\d+)(?::(\d{2}))?$/);
    if (!minute) continue; // Empty pregame rows are not zero-point performances.
    const minutes = Number(minute[1]) + Number(minute[2] ?? 0) / 60;
    if (minutes <= 0) continue;
    const stats: Record<string, number> = {};
    for (const [key, cat] of Object.entries(counts)) {
      if (!/^\d+$/.test(values[key] ?? "")) throw new Error("Incomplete player stats");
      stats[cat] = Number(values[key]);
    }
    for (const [key, [made, attempted]] of Object.entries(shots)) {
      const pair = values[key]?.match(/^(\d+)-(\d+)$/);
      if (!pair || Number(pair[1]) > Number(pair[2])) throw new Error("Invalid shooting stats");
      stats[made] = Number(pair[1]); stats[attempted] = Number(pair[2]);
    }
    const id = Number(row.athlete.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) throw new Error("Invalid or duplicate player");
    seen.add(id);
    lines.push({ playerId: id, gameId: game.id, minutes, stats });
  }
  return lines;
}
const required = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TO", "FGM", "FGA", "FTM", "FTA"];
const complete = (stats: Record<string, number | null>) => required.every(k => typeof stats[k] === "number" && Number.isFinite(stats[k]) && stats[k]! >= 0);

export function dailyPerformers(data: Pick<Snapshot, "players" | "model" | "dailyCalibration">, lines: DailyLine[], games: NbaGame[]) {
  const pool = data.players.filter(p => data.model.poolIds.includes(p.id) && p.gamesPlayed >= data.model.minimumGames && complete(p.stats));
  if (pool.length < 2) return [];
  const fgVolume = pool.reduce((s,p) => s + p.stats.FGA!, 0), ftVolume = pool.reduce((s,p) => s + p.stats.FTA!, 0);
  if (!fgVolume || !ftVolume) return [];
  const fg = pool.reduce((s,p) => s + p.stats.FGM!, 0) / fgVolume;
  const ft = pool.reduce((s,p) => s + p.stats.FTM!, 0) / ftVolume;
  const vector = (s: Player["stats"], cat: string) => cat === "FG%" ? s.FGM! - fg * s.FGA! : cat === "FT%" ? s.FTM! - ft * s.FTA! : s[cat]!;
  const distributions = CATEGORIES.map(cat => {
    const xs = pool.map(p => vector(p.stats, cat)), mean = xs.reduce((a,b) => a+b, 0)/xs.length;
    return { cat, mean, sd: Math.sqrt(xs.reduce((s,x) => s+(x-mean)**2, 0)/xs.length) };
  });
  const contributions = (s: Player["stats"]) => Object.fromEntries(distributions.map(({cat, mean, sd}) => [cat,
    (sd > 1e-12 ? (vector(s, cat)-mean)/sd : 0) * (cat === "TO" ? -1 : 1)]));
  const score = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
  return lines.flatMap(line => {
    const player = data.players.find(p => p.id === line.playerId);
    const game = games.find(g => g.id === line.gameId);
    if (!player || player.teamId === null || player.slot === "IR" || !game || !["live", "final"].includes(game.state) || !complete(line.stats)) return [];
    const categoryScores = contributions(line.stats), actual = score(categoryScores);
    const baseline = player.gamesPlayed >= data.model.minimumGames && complete(player.stats) ? contributions(player.stats) : null;
    const expected = baseline ? score(baseline) : null;
    return [{ player, game, line, score: actual, delta: expected === null ? null : actual - expected,
      categoryScores, categoryDeltas: baseline ? Object.fromEntries(CATEGORIES.map(c => [c, categoryScores[c] - baseline[c]])) : null,
      worstCutoff: calibrationCutoff(data.dailyCalibration, nbaDate(new Date(game.startsAt))) }];
  });
}
export type DailyPerformer = ReturnType<typeof dailyPerformers>[number];
export type DailyMode = "top" | "worst" | "surprise" | "letdown";
export function selectPerformers(rows: DailyPerformer[], mode: DailyMode) {
  const negative = mode === "worst" || mode === "letdown";
  return rows.filter(r => (!negative || r.game.state === "final" && r.line.minutes >= 10) &&
    (mode === "worst" ? r.worstCutoff != null && r.score < Math.min(0, r.worstCutoff) : mode === "surprise" ? r.delta !== null && r.delta > 0 : mode === "letdown" ? r.delta !== null && r.delta < 0 : true))
    .sort((a,b) => (mode === "top" ? b.score-a.score : mode === "worst" ? a.score-b.score : mode === "surprise" ? b.delta!-a.delta! : a.delta!-b.delta!) || a.player.id-b.player.id).slice(0, 6);
}

/** Never use the game being judged in its own historical cutoff, or a stale cutoff. */
export function calibrationCutoff(calibration: Snapshot["dailyCalibration"], gameDate: string): number | null {
  if (!calibration || calibration.sampleSize < 300 || calibration.dayCount < 7) return null;
  const age = (Date.parse(`${gameDate}T12:00:00Z`) - Date.parse(`${calibration.to}T12:00:00Z`)) / 86_400_000;
  return age > 0 && age <= 4 && Number.isFinite(calibration.cutoff) ? Math.min(0, calibration.cutoff) : null;
}

export function performanceNegatives(row: DailyPerformer, mode: "worst" | "letdown") {
  const values = mode === "letdown" ? row.categoryDeltas : row.categoryScores;
  if (!values) return [];
  const s = row.line.stats;
  const labels: Record<string, string> = { "FG%": `${s.FGM}/${s.FGA} FG`, "FT%": `${s.FTM}/${s.FTA} FT`,
    PTS: `${s.PTS} PTS`, REB: `${s.REB} REB`, AST: `${s.AST} AST`, STL: `${s.STL} STL`, BLK: `${s.BLK} BLK`,
    "3PM": `${s["3PM"]} 3PM`, TO: `${s.TO} TO` };
  const negatives = CATEGORIES.filter(c => values[c] < 0).map(c => ({ category: String(c), value: values[c], label: labels[c] }));
  if (s.STL === 0 && s.BLK === 0 && values.STL < 0 && values.BLK < 0) {
    return [...negatives.filter(n => n.category !== "STL" && n.category !== "BLK"),
      { category: "stocks", value: values.STL + values.BLK, label: "0 stocks" }]
      .sort((a, b) => a.value - b.value || a.category.localeCompare(b.category)).slice(0, 2).map(n => n.label);
  }
  return negatives.sort((a, b) => a.value - b.value || a.category.localeCompare(b.category)).slice(0, 2).map(n => n.label);
}
