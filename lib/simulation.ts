import type { Player } from "./schema";

export type Side = 0 | 1;
export type Point = { x: number; y: number };
export type SimLine = { pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number };
export type SimPlayer = { id: number; name: string; nbaTeam: string; position: string; usage: number; passing: number; rebound: number; steal: number; block: number; turnover: number; threeShare: number; twoPct: number; threePct: number; ftPct: number };
export type SimPlay = {
  start: number; end: number; gameStart: number; gameEnd: number; side: Side; handler: number; shooter: number; passer: number | null;
  defender: number; rebounder: number | null; outcome: "made" | "missed" | "blocked" | "turnover" | "foul";
  action: "drive" | "pull-up" | "catch-and-shoot" | "cut"; shotChance: number;
  three: boolean; points: number; text: string; score: [number, number]; lines: SimLine[];
  from: Point[]; to: Point[]; shot: Point; freeThrows: boolean[];
  frames: MotionFrame[]; finishFrames: MotionFrame[]; onBall: number; helper: number | null; passAt: number; passEnd: number;
};
export type TipOff = { spots:Point[]; jumpers:number[]; winner:Side; receiver:number; contact:number; duration:number };
export type Inbound = { start:number; end:number; side:Side; inbounder:number; receiver:number; release:number; frames:(MotionFrame & {ball:Point})[] };
export type Simulation = { inbounds:Inbound[]; tip:TipOff; players: SimPlayer[]; plays: SimPlay[]; duration: number; playbackDuration: number; seed: number };
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
function separateBodies(points:Point[]) {
  for(let iteration=0;iteration<8;iteration++) for(let i=0;i<10;i++) for(let j=i+1;j<10;j++) {
    const d=distanceTo(points[i],points[j]); if(d>=3.9)continue;
    const dx=d>.00001?(points[j].x-points[i].x)/d:0, dy=d>.00001?(points[j].y-points[i].y)/d:1, push=(3.9-d)/2;
    points[i]={x:clamp(points[i].x-dx*push,2,92),y:clamp(points[i].y-dy*push,2,48)};
    points[j]={x:clamp(points[j].x+dx*push,2,92),y:clamp(points[j].y+dy*push,2,48)};
  }
  return points;
}
/** Arrive gently, then remove closing velocity at contact while preserving sliding.
 * Positions are never pushed apart during motion: that correction fights steering
 * and causes the alternating-frame vibration. Initial formations are separated once.
 */
export function moveBodies(spots:Point[], velocities:Point[], goals:Point[], speeds:number[], dt:number) {
  const blend=1-Math.exp(-dt/.14);
  const nextVelocity=spots.map((p,i)=>{
    const dx=goals[i].x-p.x, dy=goals[i].y-p.y, distance=Math.hypot(dx,dy);
    const speed=Math.min(speeds[i],Math.max(0,distance-.04)*4);
    const desired=distance>0 ? {x:dx/distance*speed,y:dy/distance*speed} : {x:0,y:0};
    return {x:velocities[i].x+(desired.x-velocities[i].x)*blend,y:velocities[i].y+(desired.y-velocities[i].y)*blend};
  });
  // Project onto non-closing contact constraints, including court boundaries.
  // A small safety margin accommodates interacting contacts without positional snaps.
  for(let iteration=0;iteration<48;iteration++) {
    let correctionSize=0;
    for(let i=0;i<spots.length;i++) for(let j=i+1;j<spots.length;j++) {
      const dx=spots[j].x-spots[i].x, dy=spots[j].y-spots[i].y, distance=Math.hypot(dx,dy);
      const nx=distance>0?dx/distance:0, ny=distance>0?dy/distance:1;
      const closing=(nextVelocity[i].x-nextVelocity[j].x)*nx+(nextVelocity[i].y-nextVelocity[j].y)*ny;
      const allowed=Math.max(0,distance-3.95)/dt;
      if(closing>allowed) {
        const correction=(closing-allowed)/2;
        correctionSize=Math.max(correctionSize,correction);
        nextVelocity[i].x-=nx*correction; nextVelocity[i].y-=ny*correction;
        nextVelocity[j].x+=nx*correction; nextVelocity[j].y+=ny*correction;
      }
    }
    nextVelocity.forEach((v,i)=>{
      const x=clamp(v.x,(2-spots[i].x)/dt,(92-spots[i].x)/dt);
      const y=clamp(v.y,(2-spots[i].y)/dt,(48-spots[i].y)/dt);
      correctionSize=Math.max(correctionSize,Math.abs(x-v.x),Math.abs(y-v.y));
      v.x=x; v.y=y;
    });
    if(correctionSize<.00001)break;
  }
  return {spots:spots.map((p,i)=>({x:p.x+nextVelocity[i].x*dt,y:p.y+nextVelocity[i].y*dt})),velocities:nextVelocity};
}
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
    const gap = clamp(4 + rng()*2 - players[defender].steal*.1, 3.9, 6);
    result[defender] = { x:p.x + (hoop.x-p.x)/dist*gap, y:p.y + (hoop.y-p.y)/dist*gap };
  }
  return separateBodies(result);
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
export type MotionFrame = { spots: Point[]; phase: string };
/** Fixed-step steering. No outcome is sampled until this possession has played out. */
export function resolvePossession(players:SimPlayer[], side:Side, handler:number, setup:Point[], start:Point[], intent:ReturnType<typeof chooseShot>, seconds:number) {
  const offense=indices(side), defense=indices((1-side) as Side), hoop=basket(side);
  const assignments=new Map<number,number>(), available=[...defense];
  for (const i of [handler,...offense.filter(i=>i!==handler)]) {
    available.sort((a,b)=>distanceTo(setup[a],setup[i])-distanceTo(setup[b],setup[i]));
    assignments.set(i,available.shift()!);
  }
  const onBall=assignments.get(handler)!;
  let spots=start.map(p=>({...p})), shooter=intent.shooter, action=intent.action, target={...intent.shot};
  let velocities=spots.map(()=>({x:0,y:0}));
  let helper:number|null=null, contained=0, passed=false, phase="Getting set";
  const frames:MotionFrame[]=[{spots:spots.map(p=>({...p})),phase}];
  const steps=Math.max(120,Math.ceil(seconds*30)), dt=seconds/steps;
  const driveSide=intent.shot.y<=25 ? -1 : 1;
  const support=offense.filter(i=>i!==handler && i!==intent.shooter);
  const cutter=[...support].sort((a,b)=>(players[b].rebound*(1-players[b].threeShare))-(players[a].rebound*(1-players[a].threeShare)))[0];
  const attackStart=Math.max(.2,1-4.5/seconds);
  let attackTick:number|null=null, readyFor=0, usedSeconds=seconds;
  let passStartSeconds=seconds*.32/.55, passEndSeconds=seconds*.52/.55;
  const approach=(a:Point,b:Point,limit:number)=>{const d=distanceTo(a,b); return d<=limit ? {...b} : {x:a.x+(b.x-a.x)*limit/d,y:a.y+(b.y-a.y)*limit/d};};
  for(let tick=1;tick<=steps;tick++) {
    const progress=tick/steps, elapsed=tick*dt;
    if(attackTick===null && (progress>=attackStart || (elapsed>=.5 && distanceTo(spots[handler],setup[handler])<4 && distanceTo(spots[shooter],target)<8))) {
      attackTick=tick;
      passStartSeconds=elapsed; passEndSeconds=Math.min(seconds,elapsed+.45);
    }
    const attacking=attackTick!==null;
    const goals=setup.map(p=>({...p}));
    if(attacking) {
      // Coordinated support routes: a cutter clears the lane after crossing it;
      // perimeter players lift/drift into a new passing angle. No idle oscillation.
      const movement=clamp((tick-attackTick!)*dt/4.5,0,1);
      for(const i of support) {
        if(i===shooter)continue; // A kick-out receiver holds the chosen catch point.
        const origin=facing(setup[i],side), upper=origin.y<25;
        let destination:Point;
        if(i===cutter) {
          const crossing={x:82,y:25}, exit={x:85,y:upper?39:11};
          destination=intent.action==="drive"
            ? lerp(origin,{x:88,y:upper?10:40},movement)
            : movement<.55 ? lerp(origin,crossing,movement/.55) : lerp(crossing,exit,(movement-.55)/.45);
        } else {
          const destinationY=upper?8:42;
          destination=lerp(origin,{x:origin.x>80?73:82,y:destinationY},movement);
        }
        goals[i]=facing(destination,side);
      }
      phase=action==="drive" ? "Driving" : action==="pull-up" ? "Pull-up" : action==="cut" ? "Cutting" : passed ? "Kick-out" : "Moving the ball";
      if(action==="drive") {
        const h=spots[handler], d=spots[onBall], gap=distanceTo(h,d);
        const ahead=(d.x-h.x)*(hoop.x-h.x)+(d.y-h.y)*(hoop.y-h.y)>0;
        // Probe around the defender's outside shoulder, never straight through their body.
        goals[handler]=ahead && gap<7 ? {x:d.x+(side===0?3:-3),y:clamp(d.y+driveSide*4.5,4,46)} : target;
        if(ahead && gap<6) {contained+=dt; phase="Defender contains drive";}
        else contained=Math.max(0,contained-dt*.5);
        if(helper===null && distanceTo(h,hoop)<18) {
          helper=defense.filter(i=>i!==onBall).sort((a,b)=>distanceTo(spots[a],h)-distanceTo(spots[b],h))[0];
        }
        if(helper!==null)phase="Help defense";
        const helpClose=helper!==null && distanceTo(spots[helper],h)<5;
        if((contained>3.1 || helpClose || progress>.9) && distanceTo(h,hoop)>7) {
          const options=offense.filter(i=>i!==handler).map(i=>{
            const dist=distanceTo(spots[i],hoop), three=dist>=23.75 || Math.abs(spots[i].y-25)>=22;
            const q=shotQuality(players[i],spots[i],defense.map(d=>({spot:spots[d],player:players[d]})),side,three);
            return {i,three,q};
          }).filter(o=>(!o.three || players[o.i].threeShare>.25) && o.q.nearest>4.5);
          options.sort((a,b)=>b.q.expected-a.q.expected);
          const finish=shotQuality(players[handler],h,defense.map(i=>({spot:spots[i],player:players[i]})),side,false);
          if(progress<.86 && options.length && options[0].q.expected > finish.expected+.08) {
            shooter=options[0].i; target={...spots[shooter]}; action="catch-and-shoot"; passed=true;
            passStartSeconds=elapsed; passEndSeconds=Math.min(seconds,elapsed+.45); phase="Kick-out";
          } else if(contained>3.1 || progress>.9) {
            shooter=handler; target={...h}; action=distanceTo(h,hoop)<12 ? "drive" : "pull-up"; phase=action==="drive" ? "Finishing through contact" : "Drive stopped · Pull-up";
          }
        }
      }
      if(action!=="drive") goals[shooter]=target;
      if(passed || (action==="pull-up" && intent.action==="drive")) goals[handler]={...spots[handler]};
    }
    for(const i of offense) {
      const defender=assignments.get(i)!;
      const observed=attacking ? frames[Math.max(0,frames.length-1-Math.round(.25/dt))].spots : spots;
      const attacker=observed[i];
      const gap=i===handler && action==="drive" ? 4.2 : 4.5;
      goals[defender]=approach(attacker,hoop,gap);
      if(attacking && i===shooter && action!=="drive") goals[defender]=approach(attacker,hoop,4.2);
    }
    if(attacking && helper!==null && action==="drive") goals[helper]=approach(spots[handler],hoop,4.5);
    // Retain actual contact-adjusted velocity so the next tick cannot bounce back.
    const speeds=spots.map((_,i)=>defense.includes(i) ? attacking ? 11 : 16 : i===handler ? 11.5 : 14);
    const movement=moveBodies(spots,velocities,goals,speeds,dt);
    velocities=movement.velocities;
    const next=movement.spots;
    spots=next; frames.push({spots:spots.map(p=>({...p})),phase});
    // Release as soon as the shooter has arrived and received the ball, rather
    // than waiting for a random possession timer after reaching the shot spot.
    const hasBall=shooter===handler || elapsed>=passEndSeconds;
    const arrived=distanceTo(spots[shooter],target)<1 || (action==="drive" && distanceTo(spots[shooter],hoop)<7);
    readyFor=attacking && hasBall && arrived ? readyFor+dt : 0;
    if(readyFor>=.12) {usedSeconds=elapsed;break;}
  }
  const shot={...spots[shooter]}, dist=distanceTo(shot,hoop);
  const three=dist>=23.75 || Math.abs(shot.y-25)>=22;
  return {shooter,shot,three,action,to:spots,frames,onBall,helper,seconds:usedSeconds,
    passAt:Math.min(.53,passStartSeconds/usedSeconds*.55),passEnd:Math.min(.55,passEndSeconds/usedSeconds*.55)};
}

/** Follow-through, box-outs and recovery use the same contact solver as live offense.
 * Everyone reacts to the shot before knowing its result; outcome-specific movement
 * begins only when the ball reaches the rim. The shooter stays at the release point.
 */
function finishPossession(players:SimPlayer[], play:Pick<SimPlay,"side"|"to"|"shooter"|"shot"|"outcome"|"rebounder"|"defender">, seconds:number):MotionFrame[] {
  const offense=indices(play.side), defense=indices((1-play.side) as Side), hoop=basket(play.side);
  const crashers=[...offense].filter(i=>i!==play.shooter).sort((a,b)=>
    players[b].rebound/(1+distanceTo(play.to[b],hoop)/12)-players[a].rebound/(1+distanceTo(play.to[a],hoop)/12)).slice(0,2);
  const assignments=new Map<number,number>(), available=[...defense];
  for(const i of [...offense].sort((a,b)=>distanceTo(play.to[a],hoop)-distanceTo(play.to[b],hoop))) {
    available.sort((a,b)=>distanceTo(play.to[a],play.to[i])-distanceTo(play.to[b],play.to[i]));
    assignments.set(i,available.shift()!);
  }
  const runners=[...defense].filter(i=>i!==play.defender).sort((a,b)=>play.to[a].y-play.to[b].y);
  const transitionGoals=play.to.map(p=>({...p}));
  transitionGoals[play.defender]=facing({x:32,y:25},play.side);
  runners.forEach((i,n)=>{transitionGoals[i]=facing([{x:18,y:6},{x:25,y:16},{x:38,y:35},{x:43,y:44}][n],play.side);});
  const recovering=[...offense].sort((a,b)=>play.to[a].y-play.to[b].y);
  [...defense].sort((a,b)=>transitionGoals[a].y-transitionGoals[b].y).forEach((i,n)=>{
    const runner=facing(transitionGoals[i],play.side);
    transitionGoals[recovering[n]]=facing({x:runner.x-5,y:runner.y},play.side);
  });
  let spots=play.to.map(p=>({...p})), velocities=spots.map(()=>({x:0,y:0}));
  const frames:MotionFrame[]=[{spots,phase:"Gathering"}];
  const steps=Math.max(30,Math.ceil(seconds*30)), dt=seconds/steps;
  for(let tick=1;tick<=steps;tick++) {
    const t=.55+.45*tick/steps, goals=play.to.map(p=>({...p}));
    let phase="Gathering";
    if(play.outcome==="turnover" && t>=.6) {
      phase="Changing ends";
      for(const i of [...offense,...defense])goals[i]=transitionGoals[i];
    } else if(play.outcome!=="turnover") {
      phase="Boxing out";
      for(const i of offense) {
        const p=facing(play.to[i],play.side);
        goals[i]=facing(crashers.includes(i)?{x:85,y:p.y<25?20:30}:{x:58,y:clamp(p.y,8,42)},play.side);
        const defender=assignments.get(i)!, man=spots[i], gap=distanceTo(man,hoop);
        // Establish position between the offensive rebounder and the rim.
        goals[defender]={x:man.x+(hoop.x-man.x)/Math.max(1,gap)*Math.min(4.5,gap),y:man.y+(hoop.y-man.y)/Math.max(1,gap)*Math.min(4.5,gap)};
      }
      if((t-.55)*seconds/.45<.4)goals[play.shooter]=play.shot; // Brief shooting follow-through.
      if(t>=.88) {
        if(play.outcome==="made") {
          phase="Getting back";
          for(const i of offense)goals[i]=facing({x:51,y:clamp(play.to[i].y,8,42)},play.side);
          // Nearest defender collects the ball while teammates open outlet lanes.
          const inbounder=[...defense].sort((a,b)=>distanceTo(play.to[a],hoop)-distanceTo(play.to[b],hoop))[0];
          for(const i of defense)goals[i]=i===inbounder?hoop:facing({x:65,y:8+(i%5)*8},play.side);
        } else if(play.rebounder!==null) {
          phase="Chasing rebound";
          goals[play.rebounder]=facing({x:86,y:facing(play.to[play.rebounder],play.side).y<25?22:28},play.side);
        }
      }
    }
    const speeds=spots.map((_,i)=>play.outcome==="turnover" && t>=.6
      ? offense.includes(i)?14:i===play.defender?13:[16,14,11,9][runners.indexOf(i)]
      :12);
    const next=moveBodies(spots,velocities,goals,speeds,dt);
    spots=next.spots;velocities=next.velocities;
    frames.push({spots:spots.map(p=>({...p})),phase});
  }
  return frames;
}

/** A dead-ball pickup and baseline pass, with the clock stopped until the catch. */
function inboundSequence(start:number, side:Side, from:Point[], ballStart:Point, receiver:number):Inbound {
  const offense=indices(side), defense=indices((1-side) as Side);
  const inbounder=[...offense].filter(i=>i!==receiver).sort((a,b)=>distanceTo(from[a],ballStart)-distanceTo(from[b],ballStart))[0];
  const baseline=facing({x:2,y:25},side), goals=from.map(p=>({...p}));
  goals[receiver]=facing({x:18,y:25},side);
  offense.filter(i=>i!==inbounder && i!==receiver).forEach((i,n)=>{goals[i]=facing([{x:26,y:7},{x:32,y:40},{x:38,y:15}][n],side);});
  defense.forEach((i,n)=>{goals[i]=facing({x:48+(n%2)*6,y:6+n*9},side);});
  let spots=from.map(p=>({...p})), velocities=spots.map(()=>({x:0,y:0})), ball={...ballStart};
  let collected=false, setFor=0, release=-1, passFrom:Point|null=null, passTo:Point|null=null;
  const dt=1/30, frames:Inbound["frames"]=[{spots,ball,phase:"Collecting ball"}];
  for(let tick=1;tick<=900;tick++) {
    const elapsed=tick*dt;
    goals[inbounder]=collected?baseline:ballStart;
    if(release>=0)goals[receiver]=passTo!;
    const movement=moveBodies(spots,velocities,goals,spots.map(()=>12),dt);
    spots=movement.spots;velocities=movement.velocities;
    if(!collected && distanceTo(spots[inbounder],ballStart)<.5)collected=true;
    if(collected)ball=lerp(ball,spots[inbounder],Math.min(1,dt*20));
    const ready=collected && distanceTo(spots[inbounder],baseline)<.5 && distanceTo(spots[receiver],goals[receiver])<.8;
    setFor=ready?setFor+dt:0;
    if(release<0 && setFor>=.25) {release=elapsed;passFrom={...ball};passTo={...spots[receiver]};}
    if(release>=0)ball=lerp(passFrom!,spots[receiver],(elapsed-release)/.6);
    frames.push({spots:spots.map(p=>({...p})),ball:{...ball},phase:release>=0?"Inbound pass":collected?"Inbounding":"Collecting ball"});
    if(release>=0 && elapsed-release>=.6)break;
  }
  if(release<0 || (frames.length-1)*dt-release<.6)throw new Error("Could not complete inbound setup. Start a new game.");
  return {start,end:start+(frames.length-1)*dt,side,inbounder,receiver,release:start+release,frames};
}

export function simulate(lineups: [Player[], Player[]], duration = 120, seed = 1): Simulation {
  if (lineups.some(t => t.length !== 5) || new Set(lineups.flat().map(p => p.id)).size !== 10) throw new Error("Choose ten different players, five per team.");
  if (![120, 300, 600].includes(duration) || !Number.isSafeInteger(seed)) throw new Error("Invalid game settings.");
  const players = lineups.flat().map(simulationPlayer), rng = random(seed);
  const lines = players.map(emptyLine), score: [number, number] = [0, 0], plays: SimPlay[] = [], inbounds:Inbound[]=[];
  let side: Side = rng() < .5 ? 0 : 1, clock = 1.8, playback = 3;
  const jumpers=([0,1] as Side[]).map(s=>indices(s).sort((a,b)=>(players[b].rebound+(isBig(players[b])?5:0))-(players[a].rebound+(isBig(players[a])?5:0)))[0]);
  const tipSpots:Point[]=Array(10);
  for(const s of [0,1] as Side[]) {
    tipSpots[jumpers[s]]={x:s===0?45:49,y:25};
    const ring=s===0?[{x:37,y:14},{x:37,y:36},{x:53,y:14},{x:53,y:36}]:[{x:41,y:10},{x:41,y:40},{x:57,y:18},{x:57,y:32}];
    indices(s).filter(i=>i!==jumpers[s]).forEach((i,n)=>{tipSpots[i]=ring[n];});
  }
  const tip:TipOff={spots:tipSpots,jumpers,winner:side,receiver:0,contact:1.2,duration:3};
  let from: Point[] | null = tipSpots;
  while (clock < duration) {
    const offense = indices(side), defense = indices((1 - side) as Side);
    const handler = plays.at(-1)?.outcome==="turnover" ? plays.at(-1)!.defender : pick(offense, i => players[i].passing * (/PG/.test(players[i].position) ? 1.4 : 1), rng);
    if(!plays.length)tip.receiver=handler;
    const previous=plays.at(-1);
    if(previous && (previous.outcome==="made" || (previous.outcome==="foul" && previous.freeThrows.at(-1)))) {
      const inbound=inboundSequence(playback,side,from!,endBall(previous),handler);
      inbounds.push(inbound);from=inbound.frames.at(-1)!.spots;playback=inbound.end;
    }
    const setup = formation(players, side, handler, rng);
    const transition=from ? Math.max(...from.map((p,i)=>distanceTo(p,setup[i])))/14 : 0;
    let liveLength = Math.min(duration-clock,Math.max(10+Math.floor(rng()*13),(transition+4.5)/.55));
    const decision = chooseShot(players, side, handler, setup, rng);
    const motion = resolvePossession(players,side,handler,setup,from ?? setup,decision,liveLength*.55);
    liveLength=Math.min(duration-clock,motion.seconds/.55);
    const { shooter, shot, three, action, to } = motion;
    const passer = handler !== shooter ? handler : null;
    const defender = [...defense].sort((a,b) => distanceTo(to[a],shot)-distanceTo(to[b],shot))[0];
    const p = players[shooter], d = players[defender];
    const distance = distanceTo(shot,basket(side));
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
    const followThrough=outcome==="foul"?[]:finishPossession(players,{side,to,shooter,shot,outcome,defender,rebounder:null},liveLength*.45);
    const rimFrame=followThrough[Math.floor((.88-.55)/.45*(followThrough.length-1))];
    const reboundSpots=rimFrame?.spots ?? to;
    // Rebound every missed field goal and missed final free throw, including at the horn.
    if (outcome === "missed" || outcome === "blocked" || (outcome === "foul" && !freeThrows.at(-1))) {
      const oReb = offense.reduce((sum, i) => sum + players[i].rebound, 0), dReb = defense.reduce((sum, i) => sum + players[i].rebound, 0);
      retain = rng() < clamp(.25 * oReb / dReb, .12, .4);
      const candidates=retain ? offense : defense;
      const closest=Math.min(...candidates.map(i=>distanceTo(reboundSpots[i],basket(side))));
      const reachable=outcome==="foul"?candidates:candidates.filter(i=>distanceTo(reboundSpots[i],basket(side))<=closest+5);
      rebounder = pick(reachable, i => players[i].rebound / (1 + distanceTo(reboundSpots[i],basket(side)) / 4), rng);
      lines[rebounder].reb++; text += ` ${players[rebounder].name} ${retain ? "offensive " : ""}rebound.`;
    }
    lines[shooter].pts += points; score[side] += points;
    // Dead-ball playback adds time to the movie, never to the game clock.
    const gameEnd=clock+liveLength, end=playback+(outcome==="foul" ? liveLength/.55 : liveLength);
    const play:SimPlay={ start:playback, end, gameStart:clock, gameEnd, side, handler, shooter, passer, defender, rebounder, outcome, action, shotChance, three, points, text,
      score: [...score], lines: lines.map(l => ({ ...l })), from:from ?? setup, to, shot, freeThrows,
      frames:motion.frames,finishFrames:[],onBall:motion.onBall,helper:motion.helper,passAt:motion.passAt,passEnd:motion.passEnd };
    if(outcome!=="foul")play.finishFrames=rebounder===null?followThrough:finishPossession(players,play,(end-playback)*.45);
    plays.push(play);
    from = endSpots(play); clock = gameEnd; playback=end; if (!retain) side = (1 - side) as Side;
  }
  return { tip, inbounds, players, plays, duration, playbackDuration:playback, seed };
}
const playProgress = (play: SimPlay, time: number) => clamp((time-play.start)/(play.end-play.start),0,1);
// A brief gather is measured in seconds, not a percentage of possession length.
export const shotRelease = (play:SimPlay) => .55+Math.min(.2/(play.end-play.start),.1);
const freeThrowProgress = (play: SimPlay, t: number) => clamp((t-.65)/.31,0,1)*play.freeThrows.length;
export function simulationState(game: Simulation, time: number) {
  const completed = game.plays.filter(p => p.end <= time);
  const latest = completed.at(-1);
  const score: [number,number] = latest ? [...latest.score] : [0,0];
  const lines = latest ? latest.lines.map(l=>({...l})) : game.players.map(emptyLine);
  const play = game.plays[completed.length];
  if (play && time >= play.start) {
    const t = playProgress(play,time), line = lines[play.shooter];
    let points = 0;
    if (play.outcome === "foul") {
      if (t >= .55) lines[play.defender].pf++;
      const ft = freeThrowProgress(play,t);
      play.freeThrows.forEach((made,i) => { if (ft >= i+.8) { line.fta++; if (made) {line.ftm++; points++;} } });
    } else if (play.outcome === "turnover") {
      if (t >= .6) {
        lines[play.passer ?? play.shooter].to++;
        if (play.lines[play.defender].stl > lines[play.defender].stl) lines[play.defender].stl++;
      }
    } else {
      if (t >= shotRelease(play)) { line.fga++; if (play.three) line.tpa++; }
      if (t >= .88 && play.outcome === "made") {
        points = play.points; line.fgm++; if (play.three) line.tpm++;
        if (play.passer !== null) lines[play.passer].ast++;
      }
      if (t >= .88 && play.outcome === "blocked") lines[play.defender].blk++;
    }
    if (t >= .98 && play.rebounder !== null) lines[play.rebounder].reb++;
    line.pts += points; score[play.side] += points;
  }
  return { score, lines, completed };
}
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * clamp(t, 0, 1), y: a.y + (b.y - a.y) * clamp(t, 0, 1) });
type CourtEvent = { title:string; detail:string; tone:"foul"|"made"|"missed"|"neutral" };
function freeThrowSpots(play:SimPlay) {
  const result = play.to.map(p=>({...p}));
  result[play.shooter] = facing({x:75,y:25},play.side);
  const offense = indices(play.side).filter(i=>i!==play.shooter), defense = indices((1-play.side) as Side);
  const lane = [{x:86,y:18},{x:86,y:32},{x:81,y:18},{x:81,y:32},{x:77,y:18},{x:77,y:32}];
  [defense[0],defense[1],offense[0],offense[1],defense[2],defense[3]].forEach((i,n)=>{result[i]=facing(lane[n],play.side);});
  [offense[2],offense[3],defense[4]].forEach((i,n)=>{result[i]=facing({x:62,y:12+n*13},play.side);});
  return result;
}
// Boundaries share the same end positions: moving into a new possession must not teleport players.
function endSpots(play:SimPlay) { return play.outcome === "foul" ? freeThrowSpots(play) : play.finishFrames.at(-1)?.spots ?? play.to; }
function endBall(play:SimPlay) {
  const spots = endSpots(play);
  return play.rebounder !== null ? spots[play.rebounder] : play.outcome === "turnover" ? spots[play.defender] : basket(play.side);
}
export function courtFrame(game: Simulation, time: number, motion = true) {
  if(time<game.tip.duration) {
    const tip=game.tip, tapped=time>=tip.contact, progress=clamp((time-tip.contact)/(tip.duration-tip.contact),0,1);
    const ball=lerp({x:47,y:25},tip.spots[tip.receiver],progress);
    return {play:game.plays[0],spots:tip.spots.map(p=>({...p})),ball,height:motion? tapped ? Math.sin(progress*Math.PI)*1.5 : Math.sin(clamp(time/tip.contact,0,1)*Math.PI)*4:0,
      possessionSide:tip.winner,focus:tapped?tip.receiver:null,phase:tapped?"Tip won":"Tip-off",event:{title:tapped?`${tip.winner===0?"TEAL":"PINK"} BALL`:"TIP-OFF",detail:tapped?game.players[tip.jumpers[tip.winner]].name:"",tone:"neutral" as const}};
  }
  const inbound=game.inbounds.find(p=>time>=p.start && time<p.end);
  if(inbound) {
    const position=clamp((time-inbound.start)/(inbound.end-inbound.start),0,1)*(inbound.frames.length-1);
    const a=inbound.frames[Math.floor(position)],b=inbound.frames[Math.min(Math.floor(position)+1,inbound.frames.length-1)];
    const fraction=position-Math.floor(position);
    return {play:game.plays.find(p=>p.start>=inbound.end)!,spots:a.spots.map((p,i)=>lerp(p,b.spots[i],fraction)),ball:lerp(a.ball,b.ball,fraction),height:0,
      phase:a.phase,event:null,possessionSide:inbound.side,focus:time<inbound.release?inbound.inbounder:inbound.receiver};
  }
  const index = game.plays.findIndex(p=>time<p.end);
  const playIndex = index < 0 ? game.plays.length-1 : index, play = game.plays[playIndex], previous = game.plays[playIndex-1];
  const progress = playProgress(play,time);
  const t = motion ? progress : Math.floor(progress*20)/20;
  const finishing=t>=.55 && play.finishFrames.length>0;
  const frames=finishing?play.finishFrames:play.frames;
  const framePosition=clamp(finishing?(t-.55)/.45:t/.55,0,1)*(frames.length-1), frameIndex=Math.floor(framePosition);
  const a=frames[frameIndex], b=frames[Math.min(frameIndex+1,frames.length-1)];
  let spots=a.spots.map((p,i)=>lerp(p,b.spots[i],framePosition-frameIndex));
  if (play.outcome === "foul" && t >= .55) {
    const setup = clamp((t-.55)/.1,0,1);
    spots = freeThrowSpots(play).map((p,i)=>lerp(play.to[i],p,setup));
  }
  const hoop = basket(play.side);
  let ball:Point, height=0, event:CourtEvent|null=null;
  let phase = a.phase;
  if (t < .12) ball = lerp(game.inbounds.find(p=>p.end===play.start)?.frames.at(-1)?.ball ?? (previous ? endBall(previous) : game.tip.spots[game.tip.receiver]),spots[play.handler],t/.12);
  else if (play.outcome === "turnover" && t >= .32) ball = lerp(spots[play.handler],spots[play.defender],(t-.32)/.28);
  else if (t < play.passAt) ball = spots[play.handler];
  else if (t < play.passEnd) ball = lerp(spots[play.handler],spots[play.shooter],(t-play.passAt)/(play.passEnd-play.passAt));
  else if (play.outcome === "foul") {
    ball = spots[play.shooter];
    if (t >= .55 && t < .65) {
      phase = "Foul";
      event = {title:"FOUL",detail:`${game.players[play.defender].name} · ${play.freeThrows.length} free throws`,tone:"foul"};
    } else if (t >= .65) {
      const ft = freeThrowProgress(play,t), attempt = Math.min(play.freeThrows.length-1,Math.floor(ft)), portion = ft-attempt;
      const release = clamp((portion-.15)/.65,0,1);
      ball = lerp(spots[play.shooter],hoop,release);
      height = motion ? Math.sin(release*Math.PI)*2 : 0;
      phase = "Free throws";
      event = {title:`FREE THROW ${attempt+1} / ${play.freeThrows.length}`,detail:`${game.players[play.shooter].name}${portion>=.8 ? play.freeThrows[attempt] ? " · Made" : " · Missed" : ""}`,tone:portion>=.8 ? play.freeThrows[attempt] ? "made" : "missed" : "neutral"};
      // Between attempts the official returns the ball; preserve continuity on replay/seeking.
      if (portion >= .85 && attempt < play.freeThrows.length-1) ball = lerp(hoop,spots[play.shooter],(portion-.85)/.15);
    }
  } else if (t < shotRelease(play)) ball=spots[play.shooter];
  else if (t < .88) { const flight=(t-shotRelease(play))/(.88-shotRelease(play)); ball=lerp(play.shot,hoop,flight); height=motion ? Math.sin(flight*Math.PI)*3 : 0; phase="Shot in the air"; }
  else ball=hoop;
  if (play.outcome === "turnover" && t >= .6) {
    phase="Transition";
    if((t-.6)*(play.end-play.start)<.8)event={title:"TURNOVER",detail:game.players[play.passer ?? play.shooter].name,tone:"missed"};
  }
  if (play.outcome !== "foul" && play.outcome !== "turnover" && t >= .88) {
    phase=play.outcome === "made" ? "Basket" : play.outcome === "blocked" ? "Block" : "Miss";
    event={title:play.outcome === "made" ? `+${play.points}` : play.outcome === "blocked" ? "BLOCK" : "MISS",detail:game.players[play.outcome === "blocked" ? play.defender : play.shooter].name,tone:play.outcome === "made" ? "made" : "missed"};
  }
  const reboundStart=play.outcome === "foul" ? .96 : .88;
  if (play.rebounder !== null && t >= reboundStart) {
    ball=lerp(hoop,spots[play.rebounder],(t-reboundStart)/(.98-reboundStart)); height=0;
    if (t >= .98) {phase="Rebound";event={title:Math.floor(play.rebounder/5)===play.side ? "OFFENSIVE REBOUND":"REBOUND",detail:game.players[play.rebounder].name,tone:"neutral"};}
  }
  if (time >= game.playbackDuration) {phase="Final";event=null;}
  const changedHands=play.outcome==="turnover" && t>=.6;
  return {play,spots,ball,height,phase,event,possessionSide:changedHands?(1-play.side) as Side:play.side,
    focus:changedHands || event?.title==="FOUL"?play.defender: t<play.passAt?play.handler:play.shooter};
}

/** Elapsed live game time; the replay can be longer because of dead balls. */
export function gameElapsed(game:Simulation,time:number) {
  if(time<game.tip.duration)return Math.max(0,time-game.tip.contact);
  const play=game.plays.find(p=>time<p.end);
  if(!play)return game.duration;
  const progress=playProgress(play,time);
  return play.gameStart+(play.gameEnd-play.gameStart)*clamp(progress/(play.outcome==="foul"?.55:1),0,1);
}
