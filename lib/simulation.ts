import type { Player } from "./schema";

export type Side = 0 | 1;
export type Point = { x: number; y: number };
export type SimLine = { pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number };
export type SimPlayer = { id: number; name: string; nbaTeam: string; position: string; usage: number; passing: number; rebound: number; steal: number; block: number; turnover: number; threeShare: number; twoPct: number; threePct: number; ftPct: number };
export type SimPlay = {
  start: number; end: number; side: Side; handler: number; shooter: number; passer: number | null;
  defender: number; rebounder: number | null; outcome: "made" | "missed" | "blocked" | "turnover" | "foul";
  three: boolean; points: number; text: string; score: [number, number]; lines: SimLine[];
  from: Point[]; to: Point[]; shot: Point; freeThrows: boolean[];
};
export type Simulation = { players: SimPlayer[]; plays: SimPlay[]; duration: number; seed: number };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const emptyLine = (): SimLine => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });
export function canSimulate(player: Player) {
  return player.gamesPlayed >= 3 && ["MIN", "FGA", "FGM", "3PM", "FTA", "FTM", "AST", "REB", "STL", "BLK", "TO"].every(k => Number.isFinite(player.stats[k]) && player.stats[k] !== null && player.stats[k]! >= 0) && player.stats.MIN! > 0 && player.stats.FGA! > 0;
}
export function simulationPlayer(player: Player): SimPlayer {
  if (!canSimulate(player)) throw new Error("Player needs at least three games and complete stats.");
  const s = player.stats, gp = player.gamesPlayed;
  const stat = (k: string) => s[k] ?? 0;
  const per36 = (k: string) => clamp(stat(k) * 36 / Math.max(12, stat("MIN")), 0, 40);
  // The feed lacks 3PA: estimate attempt share from made threes at a .36 baseline.
  // This is an exhibition heuristic, not measured location/tactical data.
  const threeShare = clamp(stat("3PM") / .36 / stat("FGA"), 0, .8);
  const threeAttempts = stat("FGA") * threeShare;
  const threePct = clamp((stat("3PM") * gp + 30 * .36) / (threeAttempts * gp + 30), .2, .5);
  const twoAttempts = Math.max(0, stat("FGA") - threeAttempts);
  const twoPct = clamp(((stat("FGM") - stat("3PM")) * gp + 50 * .52) / (twoAttempts * gp + 50), .32, .72);
  return { id: player.id, name: player.name, nbaTeam: player.nbaTeam, position: player.position,
    usage: Math.max(3, per36("FGA") + .44 * per36("FTA")), passing: Math.max(.5, per36("AST")),
    rebound: Math.max(1, per36("REB")), steal: per36("STL"), block: per36("BLK"), turnover: per36("TO"),
    threeShare, twoPct, threePct, ftPct: clamp((stat("FTM") * gp + 20 * .77) / (stat("FTA") * gp + 20), .4, .95) };
}
function random(seed: number) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function pick(indices: number[], weight: (i: number) => number, rng: () => number) {
  const total = indices.reduce((n, i) => n + Math.max(.01, weight(i)), 0);
  let value = rng() * total;
  return indices.find(i => (value -= Math.max(.01, weight(i))) < 0) ?? indices[indices.length - 1];
}
const indices = (side: Side) => Array.from({ length: 5 }, (_, i) => i + side * 5);
const facing = (p: Point, side: Side): Point => side === 0 ? p : { x: 94 - p.x, y: p.y };
export const basket = (side: Side): Point => facing({ x: 88.75, y: 25 }, side);
function formation(side: Side, rng: () => number) {
  const slots = [{ x: 61, y: 25 }, { x: 69, y: 7 }, { x: 69, y: 43 }, { x: 83, y: 13 }, { x: 83, y: 37 }];
  const result: Point[] = Array(10);
  for (let i = 0; i < 5; i++) {
    const p = { x: slots[i].x + rng() * 2 - 1, y: slots[i].y + rng() * 2 - 1 };
    result[side * 5 + i] = facing(p, side);
    result[(1 - side) * 5 + i] = facing({ x: p.x + 3, y: p.y + (25 - p.y) * .12 }, side);
  }
  return result;
}
export function simulate(lineups: [Player[], Player[]], duration = 120, seed = 1): Simulation {
  if (lineups.some(t => t.length !== 5) || new Set(lineups.flat().map(p => p.id)).size !== 10) throw new Error("Choose ten different players, five per team.");
  if (![120, 300, 600].includes(duration) || !Number.isSafeInteger(seed)) throw new Error("Invalid game settings.");
  const players = lineups.flat().map(simulationPlayer), rng = random(seed);
  const lines = players.map(emptyLine), score: [number, number] = [0, 0], plays: SimPlay[] = [];
  let side: Side = rng() < .5 ? 0 : 1, clock = 0, from = formation(side, rng);
  while (clock < duration) {
    const offense = indices(side), defense = indices((1 - side) as Side);
    const handler = pick(offense, i => players[i].passing, rng), shooter = pick(offense, i => players[i].usage, rng);
    const passer = handler !== shooter ? handler : null;
    const defender = pick(defense, i => 1 + players[i].steal + players[i].block, rng);
    const p = players[shooter], d = players[defender];
    const end = Math.min(duration, clock + 10 + Math.floor(rng() * 13));
    const three = rng() < p.threeShare;
    const angle = (rng() - .5) * Math.PI * .8;
    const distance = three ? 24 + rng() * 3 : rng() < .58 ? 3 + rng() * 4 : 10 + rng() * 9;
    const shot = facing({ x: 88.75 - Math.cos(angle) * distance, y: clamp(25 + Math.sin(angle) * distance, 3, 47) }, side);
    const to = formation(side, rng); to[shooter] = shot;
    to[defender] = { x: shot.x + (basket(side).x - shot.x) * .15, y: shot.y + (25 - shot.y) * .15 };
    let outcome: SimPlay["outcome"], points = 0, rebounder: number | null = null, text: string, retain = false;
    const freeThrows: boolean[] = [];
    if (rng() < clamp(.065 + p.turnover * .015 + d.steal * .008, .07, .2)) {
      outcome = "turnover"; lines[shooter].to++;
      const stolen = rng() < .7;
      if (stolen) lines[defender].stl++;
      text = stolen ? `${d.name} steals from ${p.name}.` : `${p.name} loses it out of bounds.`;
    } else if (rng() < .09) {
      outcome = "foul"; lines[defender].pf++;
      for (let n = 0; n < (three ? 3 : 2); n++) freeThrows.push(rng() < p.ftPct);
      points = freeThrows.filter(Boolean).length;
      lines[shooter].fta += freeThrows.length; lines[shooter].ftm += points;
      text = `${d.name} fouls ${p.name}. ${points}/${freeThrows.length} at the line.`;
    } else {
      lines[shooter].fga++; if (three) lines[shooter].tpa++;
      const blocked = rng() < clamp(d.block * .018, .008, .09);
      const made = !blocked && rng() < (three ? p.threePct : p.twoPct);
      outcome = blocked ? "blocked" : made ? "made" : "missed";
      if (blocked) lines[defender].blk++;
      if (made) {
        points = three ? 3 : 2; lines[shooter].fgm++; if (three) lines[shooter].tpm++;
        if (passer !== null) lines[passer].ast++;
        text = `${p.name} ${three ? "hits a three" : distance < 8 ? "finishes at the rim" : "hits the jumper"}${passer === null ? "." : ` · ${players[passer].name} assist.`}`;
      } else text = blocked ? `${d.name} blocks ${p.name}.` : `${p.name} misses ${three ? "a three" : "a two"}.`;
    }
    // Rebound every missed field goal and missed final free throw, including at the horn.
    if (outcome === "missed" || outcome === "blocked" || (outcome === "foul" && !freeThrows.at(-1))) {
      const oReb = offense.reduce((sum, i) => sum + players[i].rebound, 0), dReb = defense.reduce((sum, i) => sum + players[i].rebound, 0);
      retain = rng() < clamp(.25 * oReb / dReb, .12, .4);
      rebounder = pick(retain ? offense : defense, i => players[i].rebound, rng);
      lines[rebounder].reb++; text += ` ${players[rebounder].name} ${retain ? "offensive " : ""}rebound.`;
    }
    lines[shooter].pts += points; score[side] += points;
    plays.push({ start: clock, end, side, handler, shooter, passer, defender, rebounder, outcome, three, points, text,
      score: [...score], lines: lines.map(l => ({ ...l })), from, to, shot, freeThrows });
    from = to; clock = end; if (!retain) side = (1 - side) as Side;
  }
  return { players, plays, duration, seed };
}
export function simulationState(game: Simulation, time: number) {
  const completed = game.plays.filter(p => p.end <= time);
  const latest = completed.at(-1);
  return { score: latest?.score ?? [0, 0] as [number, number], lines: latest?.lines ?? game.players.map(emptyLine), completed };
}
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * clamp(t, 0, 1), y: a.y + (b.y - a.y) * clamp(t, 0, 1) });
export function courtFrame(game: Simulation, time: number, motion = true) {
  const play = game.plays.find(p => time < p.end) ?? game.plays.at(-1)!;
  const progress = clamp((time - play.start) / (play.end - play.start), 0, 1);
  const t = motion ? progress : Math.floor(progress * 4) / 4;
  const spots = play.to.map((p, i) => lerp(play.from[i], p, t / .55));
  // Keep lanes through transitions and separate nearby bodies without a physics engine.
  if (motion && t > .55 && t < .88) spots.forEach((p, i) => { if (i !== play.shooter) p.y = clamp(p.y + Math.sin(time * 1.5 + i) * .7, 2, 48); });
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    const dx = spots[j].x - spots[i].x, dy = spots[j].y - spots[i].y, d = Math.hypot(dx, dy);
    if (d < 3.6) { const nx = d > .01 ? dx / d : 0, ny = d > .01 ? dy / d : 1, shift = (3.6 - d) / 2;
      spots[i] = { x: clamp(spots[i].x - nx * shift, 2, 92), y: clamp(spots[i].y - ny * shift, 2, 48) };
      spots[j] = { x: clamp(spots[j].x + nx * shift, 2, 92), y: clamp(spots[j].y + ny * shift, 2, 48) };
    }
  }
  const hoop = basket(play.side);
  let ball: Point, height = 0;
  if (t < .32) ball = { x: spots[play.handler].x + 1.5, y: spots[play.handler].y + (motion ? Math.sin(time * 10) * .6 : 0) };
  else if (t < .52) ball = lerp(spots[play.handler], spots[play.shooter], (t - .32) / .2);
  else if (t < .65) ball = spots[play.shooter];
  else if (play.outcome === "turnover") ball = lerp(spots[play.shooter], spots[play.defender], (t - .65) / .2);
  else if (t < .88) { const flight = (t - .65) / .23; ball = lerp(play.shot, hoop, flight); height = motion ? Math.sin(flight * Math.PI) * 3 : 0; }
  else ball = play.rebounder === null ? hoop : lerp(hoop, spots[play.rebounder], (t - .88) / .12);
  return { play, spots, ball, height, phase: time >= game.duration ? "Final" : t < .32 ? "Bringing it up" : t < .52 ? "Moving the ball" : t < .65 ? "Creating a shot" : t < .88 ? play.outcome === "turnover" ? "Turnover" : "At the basket" : "Finishing the play" };
}
