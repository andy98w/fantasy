import type { Player } from "./schema";

export type Side = 0 | 1;
export type Point = { x: number; y: number };
export type SimLine = { pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number };
export type SimPlayer = { id: number; name: string; nbaTeam: string; position: string; usage: number; passing: number; rebound: number; steal: number; block: number; turnover: number; threeShare: number; twoPct: number; threePct: number; ftPct: number };
export type SimPlay = {
  start: number; end: number; side: Side; handler: number; shooter: number; passer: number | null;
  defender: number; rebounder: number | null; outcome: "made" | "missed" | "blocked" | "turnover" | "foul";
  action: "drive" | "pull-up" | "catch-and-shoot" | "cut"; shotChance: number;
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
const distanceTo = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const isBig = (p: SimPlayer) => /C|PF/.test(p.position);
function formation(players: SimPlayer[], side: Side, handler: number, rng: () => number) {
  const offense = indices(side), defense = indices((1 - side) as Side);
  const big = [...offense].filter(i => i !== handler).sort((a, b) => (players[b].rebound + (isBig(players[b]) ? 5 : 0)) - (players[a].rebound + (isBig(players[a]) ? 5 : 0)))[0];
  const wings = offense.filter(i => i !== handler && i !== big).sort((a,b) => players[b].threeShare - players[a].threeShare);
  const result: Point[] = Array(10);
  result[handler] = facing({ x:62, y:25 }, side);
  result[big] = facing({ x:84, y:19 + rng()*12 }, side);
  // Stronger perimeter shooters occupy the corners; non-shooters cut inside.
  const wingSpots = [{x:87,y:3},{x:85,y:47},{x:68,y:8}];
  wings.forEach((i, slot) => { const p = wingSpots[slot]; result[i] = facing(players[i].threeShare > .25 ? p : {x:78 + rng()*4,y:12 + slot*12}, side); });
  const available = [...defense];
  // Match interior players first, then put guards on ball handlers/wings.
  for (const i of [big, handler, ...wings]) {
    available.sort((a,b) => Math.abs(players[a].rebound - players[i].rebound) - Math.abs(players[b].rebound - players[i].rebound));
    const defender = available.shift()!, p = result[i], hoop = basket(side), dist = distanceTo(p, hoop);
    const gap = clamp(2 + rng()*5 - players[defender].steal*.3, 1.5, 7);
    result[defender] = { x:p.x + (hoop.x-p.x)/dist*gap, y:p.y + (hoop.y-p.y)/dist*gap };
  }
  return result;
}
/** Possession-level heuristic: open shots beat contested ones; rim protection matters inside. */
export function shotQuality(player: SimPlayer, shot: Point, defenders: {spot:Point; player:SimPlayer}[], side:Side, three:boolean) {
  const hoopDistance = distanceTo(shot, basket(side));
  const nearest = Math.min(...defenders.map(d => distanceTo(shot, d.spot)));
  const contest = clamp((6 - nearest) / 6, 0, 1);
  const protection = defenders.reduce((sum,d) => sum + d.player.block * Math.max(0, 1-distanceTo(shot,d.spot)/10),0);
  const location = three ? 0 : hoopDistance < 8 ? .10 : -.08;
  const chance = clamp((three ? player.threePct : player.twoPct) + location + .04*(1-contest) - contest*(three ? .13 : .12) - (three ? 0 : protection*.018), .12, .82);
  return { chance, expected: chance*(three ? 3 : 2), nearest };
}
function chooseShot(players:SimPlayer[], side:Side, handler:number, to:Point[], rng:()=>number) {
  const defense = indices((1-side) as Side), hoop = basket(side);
  const defenders = defense.map(i => ({spot:to[i],player:players[i]}));
  const candidates: {shooter:number; shot:Point; three:boolean; action:SimPlay["action"]; chance:number; value:number}[] = [];
  const offer = (shooter:number, shot:Point, three:boolean, action:SimPlay["action"]) => {
    const quality = shotQuality(players[shooter],shot,defenders,side,three);
    const passDistance = distanceTo(to[handler],shot);
    // A long pass is a little riskier; efficient, open shots are worth moving the ball for.
    const passCost = shooter === handler ? 0 : .025 + passDistance*.002/Math.sqrt(players[handler].passing);
    candidates.push({shooter,shot,three,action,chance:quality.chance,value:quality.expected-passCost});
  };
  for (const i of indices(side)) {
    const p = players[i];
    if (i === handler) {
      offer(i, facing({x:84 + rng()*3,y:22 + rng()*6},side), false, "drive");
      const three = p.threeShare > .25;
      offer(i, facing({x:three ? 63:73,y:20+rng()*10},side), three, "pull-up");
    } else {
      const spot = to[i], dist = distanceTo(spot,hoop), corner = Math.abs(spot.y-25) >= 22;
      const three = dist >= 23.75 || corner;
      offer(i, spot, three, three || dist > 8 ? "catch-and-shoot" : "cut");
    }
  }
  // Soft choice favors expected points without making the same play every time.
  const selected = pick(candidates.map((_,i)=>i), i => Math.exp(candidates[i].value*5) * Math.pow(players[candidates[i].shooter].usage,.35), rng);
  return candidates[selected];
}
export function simulate(lineups: [Player[], Player[]], duration = 120, seed = 1): Simulation {
  if (lineups.some(t => t.length !== 5) || new Set(lineups.flat().map(p => p.id)).size !== 10) throw new Error("Choose ten different players, five per team.");
  if (![120, 300, 600].includes(duration) || !Number.isSafeInteger(seed)) throw new Error("Invalid game settings.");
  const players = lineups.flat().map(simulationPlayer), rng = random(seed);
  const lines = players.map(emptyLine), score: [number, number] = [0, 0], plays: SimPlay[] = [];
  let side: Side = rng() < .5 ? 0 : 1, clock = 0;
  let from = formation(players, side, pick(indices(side), i => players[i].passing, rng), rng);
  while (clock < duration) {
    const offense = indices(side), defense = indices((1 - side) as Side);
    const handler = pick(offense, i => players[i].passing * (/PG/.test(players[i].position) ? 1.4 : 1), rng);
    const to = formation(players, side, handler, rng);
    const decision = chooseShot(players, side, handler, to, rng);
    const { shooter, shot, three, action } = decision;
    const passer = handler !== shooter ? handler : null;
    const defender = [...defense].sort((a,b) => distanceTo(to[a],shot)-distanceTo(to[b],shot))[0];
    const p = players[shooter], d = players[defender];
    const end = Math.min(duration, clock + 10 + Math.floor(rng() * 13));
    const distance = distanceTo(shot,basket(side));
    to[shooter] = shot;
    // Close out toward the chosen receiver; do not teleport a random defender onto them.
    to[defender] = { x:to[defender].x+(shot.x-to[defender].x)*.2, y:to[defender].y+(shot.y-to[defender].y)*.2 };
    const quality = shotQuality(p,shot,defense.map(i=>({spot:to[i],player:players[i]})),side,three);
    const shotChance = quality.chance;
    const ballPlayer = passer === null ? p : players[handler];
    const pressure = clamp(1-quality.nearest/8,0,1);
    const turnoverChance = clamp(.035 + ballPlayer.turnover*.012 + d.steal*.006 + pressure*.025 + (passer === null ? .015 : .025/Math.sqrt(ballPlayer.passing)), .04, .2);
    let outcome: SimPlay["outcome"], points = 0, rebounder: number | null = null, text: string, retain = false;
    const freeThrows: boolean[] = [];
    if (rng() < turnoverChance) {
      outcome = "turnover"; lines[passer ?? shooter].to++;
      const stolen = rng() < .7;
      if (stolen) lines[defender].stl++;
      text = stolen ? `${d.name} steals from ${ballPlayer.name}.` : `${ballPlayer.name} loses it out of bounds.`;
    } else if (rng() < (three ? .025 : distance < 8 ? .13 : .06)) {
      outcome = "foul"; lines[defender].pf++;
      for (let n = 0; n < (three ? 3 : 2); n++) freeThrows.push(rng() < p.ftPct);
      points = freeThrows.filter(Boolean).length;
      lines[shooter].fta += freeThrows.length; lines[shooter].ftm += points;
      text = `${d.name} fouls ${p.name}. ${points}/${freeThrows.length} at the line.`;
    } else {
      lines[shooter].fga++; if (three) lines[shooter].tpa++;
      const blocked = rng() < clamp(d.block * (three ? .005 : .022) * clamp(1-quality.nearest/10,0,1), .002, .12);
      const made = !blocked && rng() < shotChance;
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
      rebounder = pick(retain ? offense : defense, i => players[i].rebound / (1 + distanceTo(to[i],basket(side)) / 12), rng);
      lines[rebounder].reb++; text += ` ${players[rebounder].name} ${retain ? "offensive " : ""}rebound.`;
    }
    lines[shooter].pts += points; score[side] += points;
    plays.push({ start: clock, end, side, handler, shooter, passer, defender, rebounder, outcome, action, shotChance, three, points, text,
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
  if (play.outcome === "turnover" && t >= .32) ball = lerp(spots[play.handler], spots[play.defender], (t - .32) / .33);
  else if (t < .32) ball = { x: spots[play.handler].x + 1.5, y: spots[play.handler].y + (motion ? Math.sin(time * 10) * .6 : 0) };
  else if (t < .52) ball = lerp(spots[play.handler], spots[play.shooter], (t - .32) / .2);
  else if (t < .65) ball = spots[play.shooter];
  else if (play.outcome === "turnover") ball = lerp(spots[play.shooter], spots[play.defender], (t - .65) / .2);
  else if (t < .88) { const flight = (t - .65) / .23; ball = lerp(play.shot, hoop, flight); height = motion ? Math.sin(flight * Math.PI) * 3 : 0; }
  else ball = play.rebounder === null ? hoop : lerp(hoop, spots[play.rebounder], (t - .88) / .12);
  return { play, spots, ball, height, phase: time >= game.duration ? "Final" : t < .32 ? "Bringing it up" : t < .52 ? "Moving the ball" : t < .65 ? (play.action === "drive" ? "Driving to the rim" : play.action === "cut" ? "Cutting to the basket" : play.action === "catch-and-shoot" ? "Finding the open shot" : "Pulling up") : t < .88 ? play.outcome === "turnover" ? "Turnover" : "At the basket" : "Finishing the play" };
}
