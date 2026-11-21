import type { Player } from "./schema";

export type Side = 0 | 1;
export type Point = { x: number; y: number };
export type SimLine = { pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number };
export type SimPlayer = { id: number; name: string; nbaTeam: string; position: string; usage: number; passing: number; rebound: number; steal: number; block: number; turnover: number; threeShare: number; twoPct: number; threePct: number; ftPct: number };
export type ScreenPlan = { screener:number; mode:"roll"|"pop"; coverage:"switch"|"drop"; direction:-1|1 };
export type MovementPlan = { kind:"handoff"|"off-ball-screen"; receiver:number; screener:number; direction:-1|1 };
export type FastBreak = { trigger:"steal"|"rebound"; result:"rim"|"pull-up"|"settled"; passes:number };
type ShotIntent = {shooter:number; shot:Point; three:boolean; action:SimPlay["action"]; chance:number; value:number; screen?:ScreenPlan; movement?:MovementPlan};
export type SimPlay = {
  start: number; end: number; approachSeconds:number; gameStart: number; gameEnd: number; side: Side; handler: number; shooter: number; passer: number | null;
  defender: number; rebounder: number | null; outcome: "made" | "missed" | "blocked" | "turnover" | "foul" | "violation" | "expired";
  action: "drive" | "pull-up" | "catch-and-shoot" | "cut"; shotChance: number;
  screen?:ScreenPlan; movement?:MovementPlan; fastBreak?:FastBreak; stolen:boolean; shotClockStart:number;
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
/** Inferred tendencies, not measured tracking or name-based signature animations.
 * Continuous blends let a passing/shooting big keep both parts of their game. */
export function playerStyle(p:SimPlayer) {
  const big=isBig(p), perimeter=clamp(p.threeShare/.65,0,1);
  const creation=clamp(p.passing/10*.65+p.usage/28*.35,0,1);
  return {
    perimeter, creation,
    relocation:clamp(.15+.85*perimeter*(1-.35*creation),0,1),
    cutting:clamp(.15+.55*(1-perimeter)+(big?0:.2),0,1),
    interior:clamp((big?.45:.08)+p.rebound/18*.3+(1-perimeter)*.25,0,1),
    screening:clamp(.1+(big?.55:0)+p.rebound/15*.3,0,1),
    hub:big?clamp(p.passing/9,0,1):0,
    pullUp:perimeter*(.25+.75*creation),
  };
}
/** Choose a basketball destination instead of giving every off-ball player the
 * same lift. Origins stay fixed for the possession, avoiding frame-to-frame flips. */
export function supportRoute(p:SimPlayer, origin:Point, side:Side, progress:number, cutter:boolean, driving:boolean) {
  const style=playerStyle(p), local=facing(origin,side), upper=local.y<25;
  const movement=clamp(progress*(.65+style.relocation*.7+style.cutting*.25),0,1);
  let destination:Point;
  if(cutter) {
    const crossing={x:83,y:25}, exit={x:85,y:upper?39:11};
    destination=driving?lerp(local,{x:88,y:upper?10:40},movement)
      :movement<.55?lerp(local,crossing,movement/.55):lerp(crossing,exit,(movement-.55)/.45);
  } else if(style.hub>.65) {
    destination=lerp(local,{x:75,y:upper?16:34},movement); // Elbow passing outlet.
  } else if(style.perimeter>.45) {
    destination=lerp(local,local.x>77?{x:66,y:upper?10:40}:{x:87,y:upper?3:47},movement);
  } else if(style.interior>.6) {
    destination=lerp(local,{x:86,y:upper?17:33},movement); // Dunker spot; don't clog the drive.
  } else {
    destination=lerp(local,{x:64+5*(1-style.creation),y:upper?12:38},movement);
  }
  return facing(destination,side);
}
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
  const bigStyle=playerStyle(players[big]);
  result[big] = facing({ x:bigStyle.hub>.65?75:bigStyle.perimeter>.55?64:84, y:19 + rng()*12 }, side);
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
export function chooseShot(players:SimPlayer[], side:Side, handler:number, to:Point[], rng:()=>number):ShotIntent {
  const defense = indices((1-side) as Side), hoop = basket(side);
  const defenders = defense.map(i => ({spot:to[i],player:players[i]}));
  const candidates: {shooter:number; shot:Point; three:boolean; action:SimPlay["action"]; chance:number; value:number}[] = [];
  const offer = (shooter:number, shot:Point, three:boolean, action:SimPlay["action"]) => {
    const quality = shotQuality(players[shooter],shot,defenders,side,three);
    const passDistance = distanceTo(to[handler],shot);
    // A long pass is a little riskier; efficient, open shots are worth moving the ball for.
    const passCost = shooter === handler ? 0 : .025 + passDistance*.002/Math.sqrt(players[handler].passing);
    const style=playerStyle(players[shooter]);
    const preference=action==="drive"?.18*(1-style.perimeter)+.1*style.creation
      :action==="pull-up"?.22*style.pullUp
      :three?.22*style.relocation:.16*style.interior;
    candidates.push({shooter,shot,three,action,chance:quality.chance,value:quality.expected-passCost+preference});
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
  const teammates=indices(side).filter(i=>i!==handler), handlerStyle=playerStyle(players[handler]);
  const screenFit=Math.max(...teammates.map(i=>playerStyle(players[i]).screening));
  if(rng()<clamp(.14+.28*handlerStyle.creation+.15*screenFit-.2*handlerStyle.hub,.14,.57)) {
    const screener=pick(teammates,i=>Math.pow(playerStyle(players[i]).screening,2),rng);
    const mode=players[screener].threeShare>.3 && rng()<playerStyle(players[screener]).perimeter*.8 ? "pop" : "roll";
    return {shooter:handler,shot:facing({x:78,y:25},side),three:false,action:"drive",chance:0,value:0,
      screen:{screener,mode,coverage:rng()<.35?"switch":"drop",direction:rng()<.5?-1:1}};
  }
  const movementFit=Math.max(...teammates.map(i=>playerStyle(players[i]).relocation));
  if(rng()<clamp(.16+.42*movementFit+.18*handlerStyle.hub,.16,.75)) {
    const receiver=pick(teammates,i=>players[i].usage*(.12+Math.pow(playerStyle(players[i]).relocation,2)),rng);
    const kind=rng()<.25+.5*handlerStyle.hub?"handoff":"off-ball-screen";
    const screener=kind==="handoff"?handler:pick(teammates.filter(i=>i!==receiver),i=>Math.pow(playerStyle(players[i]).screening,2),rng);
    return { ...candidates[selected], shooter:receiver, action:"catch-and-shoot",
      movement:{kind,receiver,screener,direction:rng()<.5?-1:1} };
  }
  return candidates[selected];
}
export type MotionFrame = { spots: Point[]; phase: string; at?:number; ball?:Point; carrier?:number };
/** Fixed-step steering. No outcome is sampled until this possession has played out. */
export function resolvePossession(players:SimPlayer[], side:Side, handler:number, setup:Point[], start:Point[], intent:ShotIntent, seconds:number) {
  const offense=indices(side), defense=indices((1-side) as Side), hoop=basket(side);
  const assignments=new Map<number,number>(), available=[...defense];
  for (const i of [handler,...offense.filter(i=>i!==handler)]) {
    available.sort((a,b)=>distanceTo(setup[a],setup[i])-distanceTo(setup[b],setup[i]));
    assignments.set(i,available.shift()!);
  }
  const onBall=assignments.get(handler)!;
  const screen=intent.screen, movementPlan=intent.movement;
  let movementStage:"setup"|"using"|"finish"|"done"=movementPlan?"setup":"done";
  let movementPlanted=0, exchanged=false, movementPassed=false;
  const direction=movementPlan?.direction??1;
  const movementSpot=facing(movementPlan?.kind==="handoff"?{x:62,y:25}:{x:75,y:25-direction*11},side);
  const movementApproach=facing(movementPlan?.kind==="handoff"?{x:57,y:25+direction*5}:{x:70,y:25-direction*16},side);
  const movementExit=facing(movementPlan?.kind==="handoff"?{x:63,y:25+direction*5}:{x:80,y:25-direction*16},side);
  const screenOrigin=facing(setup[handler],side);
  const screenSpot=screen ? facing({x:screenOrigin.x+5,y:screenOrigin.y+screen.direction*4.5},side) : null;
  let screenStage:"setup"|"using"|"reading"|"done"=screen?"setup":"done";
  let plantedFor=0, screenUsedAt=0, readAt=0, turnedCorner=false;
  const screenDefender=screen?assignments.get(screen.screener)!:null;
  let spots=start.map(p=>({...p})), shooter=intent.shooter, action=intent.action, target={...intent.shot};
  let velocities=spots.map(()=>({x:0,y:0}));
  let helper:number|null=null, contained=0, passed=false, phase="Getting set";
  const frames:MotionFrame[]=[{spots:spots.map(p=>({...p})),phase}];
  const steps=Math.max(120,Math.ceil(seconds*30)), dt=seconds/steps;
  const driveSide=intent.shot.y<=25 ? -1 : 1;
  const support=offense.filter(i=>i!==handler && i!==intent.shooter && i!==screen?.screener && i!==movementPlan?.screener);
  const cutter=[...support].filter(i=>playerStyle(players[i]).cutting>.55 && playerStyle(players[i]).hub<.65)
    .sort((a,b)=>playerStyle(players[b]).cutting-playerStyle(players[a]).cutting)[0];
  const attackStart=Math.min(.2,4.5/seconds);
  let attackTick:number|null=null, readyFor=0, usedSeconds=seconds;
  let passStartSeconds=seconds*.32/.55, passEndSeconds=seconds*.52/.55;
  const approach=(a:Point,b:Point,limit:number)=>{const d=distanceTo(a,b); return d<=limit ? {...b} : {x:a.x+(b.x-a.x)*limit/d,y:a.y+(b.y-a.y)*limit/d};};
  for(let tick=1;tick<=steps;tick++) {
    const progress=tick/steps, elapsed=tick*dt;
    if(attackTick===null && (progress>=attackStart || ((screen || movementPlan) && elapsed>=.5) || (elapsed>=.5 && distanceTo(spots[handler],setup[handler])<4 && distanceTo(spots[shooter],target)<8))) {
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
        goals[i]=supportRoute(players[i],setup[i],side,movement,i===cutter,intent.action==="drive");
        if(movementPlan?.kind==="off-ball-screen" && movementStage!=="done") {
          // Keep the curl lane clear while a teammate uses the screen.
          const slot=support.indexOf(i), style=playerStyle(players[i]);
          goals[i]=facing({x:style.perimeter>.45?66+slot*16:84,y:25+direction*(12+slot*6)},side);
        }
      }
      phase=action==="drive" ? "Driving" : action==="pull-up" ? "Pull-up" : action==="cut" ? "Cutting" : passed ? "Kick-out" : "Moving the ball";
      if(action==="drive" && screenStage==="done" && !movementPlan) {
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
        const patience=3.8-playerStyle(players[handler]).creation*1.4;
        if((contained>patience || helpClose || progress>.9) && distanceTo(h,hoop)>7) {
          const options=offense.filter(i=>i!==handler).map(i=>{
            const dist=distanceTo(spots[i],hoop), three=dist>=23.75 || Math.abs(spots[i].y-25)>=22;
            const q=shotQuality(players[i],spots[i],defense.map(d=>({spot:spots[d],player:players[d]})),side,three);
            return {i,three,q};
          }).filter(o=>(!o.three || players[o.i].threeShare>.25) && o.q.nearest>4.5);
          options.sort((a,b)=>b.q.expected-a.q.expected);
          const finish=shotQuality(players[handler],h,defense.map(i=>({spot:spots[i],player:players[i]})),side,false);
          if(progress<.86 && options.length && options[0].q.expected > finish.expected+.18-playerStyle(players[handler]).creation*.18) {
            shooter=options[0].i; target={...spots[shooter]}; action="catch-and-shoot"; passed=true;
            passStartSeconds=elapsed; passEndSeconds=Math.min(seconds,elapsed+.45); phase="Kick-out";
          } else if(contained>patience || progress>.9) {
            shooter=handler; target={...h}; action=distanceTo(h,hoop)<12 ? "drive" : "pull-up"; phase=action==="drive" ? "Finishing through contact" : "Drive stopped · Pull-up";
          }
        }
      }
      if(action!=="drive" && screenStage==="done") goals[shooter]=target;
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
    if(screen && screenSpot && screenStage!=="done") {
      const s=screen.screener, dir=screen.direction, origin=facing(screenSpot,side);
      const exit=facing({x:origin.x+1,y:origin.y+dir*5},side);
      const pocket=facing({x:origin.x+10,y:origin.y+dir*2},side);
      goals[handler]=setup[handler]; goals[s]=screenSpot;
      phase="Setting screen";
      if(screenStage==="setup") {
        // Set feet before the guard uses the screen; a moving body is not a screen.
        const settled=distanceTo(spots[s],screenSpot)<.6 && Math.hypot(velocities[s].x,velocities[s].y)<1
          && distanceTo(spots[handler],setup[handler])<1.5;
        plantedFor=settled?plantedFor+dt:0;
        if(plantedFor>=.25) {screenStage="using";screenUsedAt=elapsed;}
      }
      if(screenStage==="using" || screenStage==="reading") {
        if(distanceTo(spots[handler],exit)<1.3)turnedCorner=true;
        goals[handler]=turnedCorner?pocket:exit;
        phase=screen.coverage==="switch"?"Screen · Switch":"Screen · Drop coverage";
        if(screenStage==="using" && turnedCorner && elapsed-screenUsedAt>.6) {screenStage="reading";readAt=elapsed;}
        if(screenStage==="reading") {
          goals[s]=facing(screen.mode==="roll"?{x:85,y:25-dir*3}:{x:62,y:25},side);
          phase=screen.mode==="roll"?"Pick-and-roll":"Pick-and-pop";
        }
        if(screen.coverage==="switch") {
          goals[screenDefender!]=approach(spots[handler],hoop,4.2);
          goals[onBall]=approach(spots[s],hoop,4.2);
        } else {
          // Chase around the planted body, while the big protects the paint.
          const chased=facing(spots[onBall],side);
          goals[onBall]=chased.y*dir< (origin.y+dir*8)*dir && !turnedCorner
            ? facing({x:origin.x-4.5,y:origin.y+dir*8},side)
            : approach(spots[handler],hoop,3.9);
          goals[screenDefender!]=facing({x:81,y:25+dir*3},side);
        }
        if(screenStage==="reading" && elapsed-readAt>=1.6) {
          const defenders=defense.map(i=>({spot:spots[i],player:players[i]}));
          const options=offense.map(i=>{
            const spot=spots[i], three=distanceTo(spot,hoop)>=23.75 || Math.abs(spot.y-25)>=22;
            const q=shotQuality(players[i],spot,defenders,side,three);
            const passCost=i===handler?0:.04+distanceTo(spots[handler],spot)*.003/Math.sqrt(players[handler].passing);
            return {i,three,value:q.expected-passCost};
          }).filter(o=>!o.three || players[o.i].threeShare>.25).sort((a,b)=>b.value-a.value);
          shooter=options[0]?.i??handler; target={...spots[shooter]};
          action=distanceTo(target,hoop)<10?"cut":shooter===handler?"pull-up":"catch-and-shoot";
          passed=shooter!==handler; passStartSeconds=elapsed;passEndSeconds=elapsed+.45;
          if(screen.coverage==="switch") {assignments.set(handler,screenDefender!);assignments.set(s,onBall);}
          screenStage="done";
        }
      }
      // A broken setup or late clock becomes an actual-position attempt, not a teleport.
      if(elapsed>seconds-.6 && screenStage!=="done") {
        shooter=handler;target={...spots[handler]};action="pull-up";screenStage="done";
        phase="Screen covered · Pull-up";
      }
    }
    if(movementPlan && movementStage!=="done") {
      const {kind,receiver,screener}=movementPlan, receiverDefender=assignments.get(receiver)!;
      goals[handler]=kind==="handoff"?movementSpot:setup[handler];
      goals[screener]=movementSpot;
      goals[receiver]=movementApproach;
      phase=kind==="handoff"?"Setting up handoff":"Setting off-ball screen";
      if(movementStage==="setup") {
        if(kind==="handoff") {
          const approachPoint=facing(movementApproach,side);
          goals[receiverDefender]=facing({x:approachPoint.x-4.5,y:approachPoint.y},side);
        }
        const settled=distanceTo(spots[screener],movementSpot)<.7 && Math.hypot(velocities[screener].x,velocities[screener].y)<1
          && distanceTo(spots[receiver],movementApproach)<1.2;
        movementPlanted=settled?movementPlanted+dt:0;
        if(movementPlanted>=.2)movementStage="using";
      }
      if(movementStage==="using") {
        goals[receiver]=movementExit;
        phase=kind==="handoff"?"Dribble handoff":"Off-ball screen · Curl";
        // The receiver goes around the planted body; the defender trails outside it.
        const local=facing(movementSpot,side);
        goals[receiverDefender]=facing({x:local.x-4.5,y:local.y+direction*5},side);
        if(kind==="handoff" && !exchanged && distanceTo(spots[receiver],spots[handler])<5.3) {
          exchanged=true;passStartSeconds=elapsed;passEndSeconds=elapsed+.2;
        }
        if(distanceTo(spots[receiver],movementExit)<1.3 && (kind!=="handoff" || (exchanged && elapsed>=passEndSeconds))) {
          movementStage="finish";
          if(kind==="off-ball-screen") {passStartSeconds=elapsed;passEndSeconds=elapsed+.45;movementPassed=true;}
          target=facing(players[receiver].threeShare>.35?{x:67,y:25-direction*14}:{x:82,y:25-direction*5},side);
        }
      }
      if(movementStage==="finish") {
        phase=kind==="handoff"?"Handoff · Turn the corner":"Curl · Catch";
        goals[receiver]=target;
        goals[receiverDefender]=approach(spots[receiver],hoop,4.2);
        const style=playerStyle(players[screener]);
        goals[screener]=facing(style.perimeter>.55?{x:64,y:25+direction*7}:style.hub>.65?{x:75,y:25+direction*8}:{x:84,y:25+direction*7},side);
        if(distanceTo(spots[receiver],target)<1 || elapsed>seconds-.7) {
          target={...spots[receiver]};action="catch-and-shoot";movementStage="done";
        }
      }
      // If the route is denied, the current ball holder takes the late-clock read.
      if(elapsed>seconds-.5 && movementStage!=="done") {
        shooter=(exchanged || movementPassed)?receiver:handler;
        target={...spots[shooter]};action="pull-up";movementStage="done";
        if(shooter===handler) {passStartSeconds=elapsed;passEndSeconds=elapsed+.2;}
        phase="Play denied · Pull-up";
      }
    }
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
    readyFor=attacking && screenStage==="done" && movementStage==="done" && hasBall && arrived ? readyFor+dt : 0;
    if(readyFor>=.12) {usedSeconds=elapsed;break;}
  }
  const shot={...spots[shooter]}, dist=distanceTo(shot,hoop);
  const three=dist>=23.75 || Math.abs(shot.y-25)>=22;
  return {shooter,shot,three,action,to:spots,frames,onBall,helper,seconds:usedSeconds,ready:readyFor>=.12,
    passAt:Math.min(.53,passStartSeconds/usedSeconds*.55),passEnd:Math.min(.55,passEndSeconds/usedSeconds*.55)};
}

type TransitionRoles = { carrier:number; stopper:number; rim:number };
/** Keep jobs until the ball changes hands; predict the interception point, not the
 * ball's last location. The rim helper commits only when containment is beaten. */
export function transitionDefense(players:SimPlayer[], side:Side, carrier:number, spots:Point[], velocity:Point,
  previous?:TransitionRoles) {
  const defense=indices((1-side) as Side), offense=indices(side), hoop=basket(side);
  const ball=facing(spots[carrier],side), vx=side===0?velocity.x:-velocity.x;
  const intercept={x:clamp(ball.x+Math.max(4,vx*.35),4,86),y:clamp(ball.y+velocity.y*.3,4,46)};
  let roles=previous;
  if(!roles || roles.carrier!==carrier) {
    const stopper=[...defense].sort((a,b)=>{
      const cost=(i:number)=>distanceTo(facing(spots[i],side),intercept)+Math.max(0,ball.x-facing(spots[i],side).x)*1.5;
      return cost(a)-cost(b);
    })[0];
    const rim=defense.filter(i=>i!==stopper).sort((a,b)=>
      distanceTo(spots[a],hoop)-Math.min(3,players[a].block)-distanceTo(spots[b],hoop)+Math.min(3,players[b].block))[0];
    roles={carrier,stopper,rim};
  }
  const goals=spots.map(p=>({...p})), stopper=facing(spots[roles.stopper],side);
  // Shade the ball toward its current sideline, staying on the basket side.
  goals[roles.stopper]=facing({x:intercept.x,y:intercept.y+(ball.y<25?1.5:-1.5)},side);
  const beaten=ball.x>stopper.x+1.5 || distanceTo(spots[roles.stopper],spots[carrier])>7;
  const helping=ball.x>73 && beaten;
  const rimGoal=helping?{x:Math.min(87,ball.x+3.5),y:ball.y*.7+25*.3}:{x:85,y:clamp(ball.y,21,29)};
  goals[roles.rim]=facing(rimGoal,side);
  // Remaining defenders cover the most advanced runners, without duplicating a man.
  const available=defense.filter(i=>i!==roles!.stopper && i!==roles!.rim);
  const runners=offense.filter(i=>i!==carrier).sort((a,b)=>distanceTo(spots[a],hoop)-distanceTo(spots[b],hoop));
  for(const runner of runners.slice(0,available.length)) {
    available.sort((a,b)=>distanceTo(spots[a],spots[runner])-distanceTo(spots[b],spots[runner]));
    const i=available.shift()!, p=facing(spots[runner],side);
    goals[i]=facing({x:Math.min(87,p.x+3),y:p.y+(25-p.y)*.15},side);
  }
  return {roles,goals,helping};
}

/** Only nearby defenders can block; a helper may be more likely than the closest
 * guard. No minimum lottery chance for someone too far away to contest. */
export function blockCandidates(players:SimPlayer[], spots:Point[], shot:Point, side:Side, three:boolean) {
  return indices((1-side) as Side).map(i=>{
    const gap=distanceTo(spots[i],shot), reach=three?5:6.5;
    const chance=gap>=reach?0:clamp(players[i].block*(three?.025:.085)*(1-gap/reach),0,.16);
    return {i,chance};
  }).filter(c=>c.chance>0);
}

/** Push from actual possession, reading the recovering defense before choosing a shot.
 * Explicit timed ball frames preserve outlets and advance passes through a set-offense fallback.
 */
export function resolveFastBreak(players:SimPlayer[], side:Side, owner:number, start:Point[], seconds:number,
  trigger:FastBreak["trigger"], rng:()=>number=()=>.5) {
  const offense=indices(side), defense=indices((1-side) as Side), hoop=basket(side), dt=1/30;
  let spots=start.map(p=>({...p})), velocities=spots.map(()=>({x:0,y:0}));
  let carrier=owner, lastPasser:number|null=null, ball={...spots[owner]}, elapsed=0, passes=0, nextRead=.25;
  let flight:{from:Point;to:Point;receiver:number;start:number;end:number;phase:string}|null=null;
  const lanes=new Map([...offense].filter(i=>i!==owner).sort((a,b)=>start[a].y-start[b].y).map((i,n)=>[i,[7,17,34,44][n]]));
  const frames:MotionFrame[]=[{spots:spots.map(p=>({...p})),ball:{...ball},carrier,at:0,phase:trigger==="steal"?"Fast break · Push":"Rebound · Look upcourt"}];
  let result:FastBreak["result"]="settled";
  let roles:TransitionRoles|undefined;
  const laneClear=(from:Point,to:Point)=>defense.every(i=>{
    const dx=to.x-from.x,dy=to.y-from.y, length=dx*dx+dy*dy;
    const t=clamp(((spots[i].x-from.x)*dx+(spots[i].y-from.y)*dy)/Math.max(1,length),0,1);
    return distanceTo(spots[i],{x:from.x+dx*t,y:from.y+dy*t})>3.8;
  });
  const limit=Math.min(7,Math.max(0,seconds-1.2));
  while((elapsed+dt<=limit || flight!==null) && elapsed+dt<=seconds-.2) {
    elapsed+=dt;
    const local=facing(spots[carrier],side), goals=spots.map(p=>({...p}));
    let phase:string=flight?.phase??"Fast break · Push";
    // Fill separate lanes: two wide runners, an interior runner and a trailing outlet.
    for(const i of offense)if(i!==carrier) {
      const y=lanes.get(i)??(spots[i].y<25?12:38);
      goals[i]=facing({x:Math.abs(y-25)>15?82:85,y},side);
    }
    let driveY=25+(local.y<25?-3:3);
    const blocker=defense.find(i=>{
      const p=facing(spots[i],side);
      return p.x>local.x && p.x-local.x<9 && Math.abs(p.y-local.y)<5;
    });
    if(blocker!==undefined) {
      const p=facing(spots[blocker],side);
      driveY=clamp(p.y+(local.y<=p.y?-7:7),6,44);
    }
    goals[carrier]=facing({x:86,y:driveY},side);
    const coverage=transitionDefense(players,side,flight?.receiver??carrier,spots,velocities[flight?.receiver??carrier],roles);
    roles=coverage.roles;
    for(const i of defense)goals[i]=coverage.goals[i];
    if(!flight)phase=coverage.helping?"Fast break · Rim help":"Fast break · Stop the ball";
    // A short reaction window belongs to the turnover/rebound, never to each read.
    if(elapsed<.25)for(const i of defense)goals[i]=spots[i];
    if(flight)goals[flight.receiver]=flight.to;
    const speeds=spots.map((_,i)=>defense.includes(i)?15:i===carrier?13:16);
    const moved=moveBodies(spots,velocities,goals,speeds,dt);
    spots=moved.spots;velocities=moved.velocities;
    if(flight) {
      ball=lerp(flight.from,spots[flight.receiver],(elapsed-flight.start)/(flight.end-flight.start));
      if(elapsed>=flight.end) {lastPasser=carrier;carrier=flight.receiver;flight=null;ball={...spots[carrier]};nextRead=elapsed+.2;}
    } else ball={...spots[carrier]};
    let finish=false, settle=false;
    if(!flight && elapsed>=nextRead && elapsed<limit) {
      nextRead=elapsed+.2;
      const p=facing(spots[carrier],side), dist=distanceTo(spots[carrier],hoop);
      const nearest=Math.min(...defense.map(i=>distanceTo(spots[i],spots[carrier])));
      const ahead=defense.filter(i=>facing(spots[i],side).x>p.x-2).length;
      const support=offense.filter(i=>facing(spots[i],side).x>p.x-10).length;
      if(dist<9 && nearest>4.1) {result="rim";finish=true;phase="Fast break · Finish";}
      else if(dist>=23.75 && dist<27 && nearest>9 && players[carrier].threeShare>.4 && support>ahead) {
        result="pull-up";finish=true;phase="Fast break · Open three";
      } else if(passes<2) {
        const choices=offense.filter(i=>i!==carrier && i!==lastPasser).map(i=>{
          const q=facing(spots[i],side), gap=Math.min(...defense.map(d=>distanceTo(spots[d],spots[i])));
          const length=distanceTo(spots[i],spots[carrier]);
          const outlet=trigger==="rebound" && passes===0 && p.x<40 && players[i].passing>players[carrier].passing;
          const advanced=q.x>p.x+6 && gap>6;
          const usable=length>5 && length<42 && q.x>p.x+2 && laneClear(spots[carrier],spots[i]);
          return {i,usable:usable && (outlet || advanced),value:q.x-p.x+gap+players[i].passing*(outlet?2:0)};
        }).filter(c=>c.usable).sort((a,b)=>b.value-a.value);
        if(choices.length) {
          const receiver=choices[0].i, length=distanceTo(spots[carrier],spots[receiver]);
          passes++;phase=trigger==="rebound" && passes===1?"Fast break · Outlet":"Fast break · Hit ahead";
          flight={from:{...ball},to:{...spots[receiver]},receiver,start:elapsed,end:elapsed+clamp(length/60,.25,.7),phase};
        }
      }
      // With no immediate opening, preserve the ball and flow into a set.
      settle=!finish && !flight && elapsed>2 && p.x>61 && ahead>=support;
    }
    frames.push({spots:spots.map(p=>({...p})),ball:{...ball},carrier,at:elapsed,phase});
    if(finish)break;
    if(settle)break;
  }
  if(result!=="settled") {
    const shot={...spots[carrier]}, three=distanceTo(shot,hoop)>=23.75;
    return {shooter:carrier,shot,three,action:three?"pull-up" as const:"drive" as const,to:spots,frames,
      onBall:roles!.stopper,helper:roles!.rim,
      seconds:elapsed,ready:true,passAt:.1,passEnd:.2,passer:lastPasser,
      fastBreak:{trigger,result,passes},screen:undefined,movement:undefined};
  }
  // The push finishes any pass while everyone keeps running, then flows into a set.
  const setup=formation(players,side,carrier,rng), intent=chooseShot(players,side,carrier,setup,rng);
  if(seconds-elapsed<8) {delete intent.screen;delete intent.movement;}
  const half=resolvePossession(players,side,carrier,setup,spots,intent,Math.max(.01,seconds-elapsed));
  const offset=elapsed;
  half.frames.forEach((frame,n)=>{
    if(n===0)return;
    const progress=n/(half.frames.length-1)*.55;
    const at=offset+n/(half.frames.length-1)*half.seconds;
    const ball=progress<half.passAt?frame.spots[carrier]:progress>=half.passEnd?frame.spots[half.shooter]:lerp(frame.spots[carrier],frame.spots[half.shooter],(progress-half.passAt)/(half.passEnd-half.passAt));
    frames.push({...frame,at,ball:{...ball},carrier:progress<half.passEnd?carrier:half.shooter,
      phase:n<15?"Fast break covered · Flow into offense":frame.phase});
  });
  return {...half,frames,seconds:offset+half.seconds,passer:half.shooter===carrier?null:carrier,
    fastBreak:{trigger,result,passes},screen:intent.screen,movement:intent.movement};
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
          goals[play.rebounder]=play.outcome==="blocked"?lerp(play.shot,play.to[play.defender],.65):facing({x:86,y:facing(play.to[play.rebounder],play.side).y<25?22:28},play.side);
        }
      }
    }
    // A block contest happens at the release area, before rebounding recovery.
    if(play.outcome==="blocked" && t<.88)goals[play.defender]=play.to[play.defender];
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
    if(!collected && distanceTo(spots[inbounder],ballStart)<4.5)collected=true;
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
  let side: Side = rng() < .5 ? 0 : 1, clock = 1.8, playback = 3, nextShotClock=22.2;
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
    const previous=plays.at(-1);
    const handler = previous?.outcome==="turnover" ? previous.defender : previous?.rebounder ?? pick(offense, i => players[i].passing * (/PG/.test(players[i].position) ? 1.4 : 1), rng);
    if(!plays.length)tip.receiver=handler;
    if(previous && (previous.outcome==="violation" || (previous.outcome==="turnover" && !previous.stolen) || previous.outcome==="made" || (previous.outcome==="foul" && previous.freeThrows.at(-1)))) {
      const inbound=inboundSequence(playback,side,from!,endBall(previous),handler);
      inbounds.push(inbound);from=inbound.frames.at(-1)!.spots;playback=inbound.end;
    }
    const setup = formation(players, side, handler, rng);
    const shotClockStart=nextShotClock, remaining=duration-clock;
    const decision = chooseShot(players, side, handler, setup, rng);
    if(Math.min(remaining,shotClockStart)<8) {delete decision.screen;delete decision.movement;}
    const budget=Math.max(.01,Math.min(remaining,shotClockStart)-.2);
    const trigger=previous?.stolen?"steal":previous?.rebounder!==null && previous?.rebounder!==undefined && previous.side!==side && previous.outcome!=="foul"?"rebound":null;
    const transition=trigger?resolveFastBreak(players,side,handler,from!,budget,trigger,rng):null;
    const motion = transition ?? resolvePossession(players,side,handler,setup,from ?? setup,decision,budget);
    const clockExpired=!motion.ready || remaining<=.2;
    const approachSeconds=clockExpired?Math.min(remaining,shotClockStart):motion.seconds;
    const { shooter, shot, three, action, to } = motion;
    const passer = transition ? transition.passer : handler !== shooter ? handler : null;
    let defender = [...defense].sort((a,b) => distanceTo(to[a],shot)-distanceTo(to[b],shot))[0];
    const p = players[shooter], d = players[defender];
    const distance = distanceTo(shot,basket(side));
    const quality = shotQuality(p,shot,defense.map(i=>({spot:to[i],player:players[i]})),side,three);
    const shotChance = quality.chance;
    const ballPlayer = passer === null ? p : players[passer];
    const pressure = clamp(1-quality.nearest/8,0,1);
    const turnoverChance = clamp(.035 + ballPlayer.turnover*.012 + d.steal*.006 + pressure*.025 + (passer === null ? .015 : .025/Math.sqrt(ballPlayer.passing)), .04, .2);
    let outcome: SimPlay["outcome"], points = 0, rebounder: number | null = null, text: string, retain = false, stolen=false;
    const freeThrows: boolean[] = [];
    if(clockExpired) {
      outcome=remaining<shotClockStart?"expired":"violation";
      text=outcome==="violation"?"Shot clock violation · Team turnover.":"Game clock expires before the shot.";
    } else if (rng() < turnoverChance) {
      outcome = "turnover"; lines[passer ?? shooter].to++;
      stolen = rng() < .7;
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
      const candidates=blockCandidates(players,to,shot,side,three);
      const blocked = rng() < Math.min(.2,candidates.reduce((sum,c)=>sum+c.chance,0));
      if(blocked) {
        let draw=rng()*candidates.reduce((sum,c)=>sum+c.chance,0);
        defender=candidates.find(c=>(draw-=c.chance)<0)?.i ?? candidates.at(-1)!.i;
      }
      const made = !blocked && rng() < shotChance;
      outcome = blocked ? "blocked" : made ? "made" : "missed";
      if (blocked) lines[defender].blk++;
      if (made) {
        points = three ? 3 : 2; lines[shooter].fgm++; if (three) lines[shooter].tpm++;
        if (passer !== null) lines[passer].ast++;
        text = `${p.name} ${three ? "hits a three" : distance < 8 ? "finishes at the rim" : "hits the jumper"}${passer === null ? "." : ` · ${players[passer].name} assist.`}`;
      } else text = blocked ? `${players[defender].name} blocks ${p.name}.` : `${p.name} misses ${three ? "a three" : "a two"}.`;
    }
    // Shot flight is independent of possession length; a long setup cannot make
    // the ball float. Other finish phases retain their own playback durations.
    const flightSeconds=clamp(.55+distance*.024,.65,1.25);
    const finishSeconds=outcome==="foul"?3+freeThrows.length*2:outcome==="turnover"?4:
      outcome==="violation" || outcome==="expired"?1:(.2+flightSeconds)*.45/.33;
    const deadBall=["foul","violation","expired"].includes(outcome) || (outcome==="turnover" && !stolen);
    const liveLength=Math.min(remaining,approachSeconds+(deadBall?0:finishSeconds));
    const followThrough=outcome==="foul"?[]:finishPossession(players,{side,to,shooter,shot,outcome,defender,rebounder:null},finishSeconds);
    const rimFrame=followThrough[Math.floor((.88-.55)/.45*(followThrough.length-1))];
    const reboundSpots=rimFrame?.spots ?? to;
    // Rebound every missed field goal and missed final free throw, including at the horn.
    if (outcome === "missed" || outcome === "blocked" || (outcome === "foul" && !freeThrows.at(-1))) {
      const oReb = offense.reduce((sum, i) => sum + players[i].rebound, 0), dReb = defense.reduce((sum, i) => sum + players[i].rebound, 0);
      retain = rng() < clamp(.25 * oReb / dReb, .12, .4);
      const candidates=retain ? offense : defense;
      const looseBall=outcome==="blocked"?lerp(shot,to[defender],.65):basket(side);
      const closest=Math.min(...candidates.map(i=>distanceTo(reboundSpots[i],looseBall)));
      const reachable=outcome==="foul"?candidates:candidates.filter(i=>distanceTo(reboundSpots[i],looseBall)<=closest+5);
      rebounder = pick(reachable, i => players[i].rebound / (1 + distanceTo(reboundSpots[i],looseBall) / 4), rng);
      lines[rebounder].reb++; text += ` ${players[rebounder].name} ${retain ? "offensive " : ""}rebound.`;
    }
    lines[shooter].pts += points; score[side] += points;
    // Dead-ball playback adds time to the movie, never to the game clock.
    const gameEnd=Math.min(duration,clock+liveLength), end=playback+approachSeconds+finishSeconds;
    const play:SimPlay={ start:playback, end, approachSeconds, shotClockStart, gameStart:clock, gameEnd, side, handler, shooter, passer, defender, rebounder, outcome, stolen, action,
      screen:transition?transition.screen:decision.screen,movement:transition?transition.movement:decision.movement,fastBreak:transition?.fastBreak,shotChance, three, points, text,
      score: [...score], lines: lines.map(l => ({ ...l })), from:from ?? setup, to, shot, freeThrows,
      frames:motion.frames,finishFrames:[],onBall:motion.onBall,helper:motion.helper,passAt:motion.passAt,passEnd:motion.passEnd };
    if(outcome!=="foul")play.finishFrames=rebounder===null?followThrough:finishPossession(players,play,finishSeconds);
    if(outcome==="violation" || outcome==="expired" || (outcome==="turnover" && !stolen))play.finishFrames=[{spots:to,phase:outcome==="violation"?"Shot clock violation":outcome==="turnover"?"Out of bounds":"Final"}];
    plays.push(play);
    nextShotClock=retain?14:24;
    if(outcome!=="foul" && rebounder!==null)nextShotClock-=Math.max(0,gameEnd-(clock+replayTime(play,.98)-play.start));
    if(stolen)nextShotClock-=Math.max(0,gameEnd-(clock+replayTime(play,.6)-play.start));
    from = endSpots(play); clock = gameEnd; playback=end; if (!retain) side = (1 - side) as Side;
  }
  return { tip, inbounds, players, plays, duration, playbackDuration:playback, seed };
}
/** Map choreography phases to real replay seconds, with an independently timed finish. */
export function replayTime(play:SimPlay, phase:number) {
  return play.start+(phase<=.55?play.approachSeconds*phase/.55:
    play.approachSeconds+(play.end-play.start-play.approachSeconds)*(phase-.55)/.45);
}
const playProgress = (play:SimPlay,time:number) => {
  const elapsed=clamp(time-play.start,0,play.end-play.start);
  return elapsed<=play.approachSeconds?elapsed/play.approachSeconds*.55:
    .55+(elapsed-play.approachSeconds)/(play.end-play.start-play.approachSeconds)*.45;
};
export const shotRelease = (play:SimPlay) => .55+.2/(play.end-play.start-play.approachSeconds)*.45;
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
    } else if(play.outcome!=="violation" && play.outcome!=="expired") {
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
  return play.rebounder !== null ? spots[play.rebounder] : play.stolen ? spots[play.defender] : play.outcome==="turnover" || play.outcome==="violation" || play.outcome==="expired"? spots[play.shooter]:basket(play.side);
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
  let framePosition=clamp(finishing?(t-.55)/.45:t/.55,0,1)*(frames.length-1);
  if(t<.55 && frames[0].at!==undefined) {
    const elapsed=clamp(t/.55,0,1)*play.approachSeconds;
    const next=frames.findIndex(f=>f.at!>elapsed);
    const index=next<0?frames.length-1:Math.max(0,next-1);
    framePosition=index+(next>0?(elapsed-frames[index].at!)/(frames[next].at!-frames[index].at!):0);
  }
  const frameIndex=Math.floor(framePosition);
  const a=frames[frameIndex], b=frames[Math.min(frameIndex+1,frames.length-1)];
  let spots=a.spots.map((p,i)=>lerp(p,b.spots[i],framePosition-frameIndex));
  if (play.outcome === "foul" && t >= .55) {
    const setup = clamp((t-.55)/.1,0,1);
    spots = freeThrowSpots(play).map((p,i)=>lerp(play.to[i],p,setup));
  }
  const hoop = basket(play.side);
  let ball:Point, height=0, event:CourtEvent|null=null;
  let phase = a.phase;
  if(t<.55 && a.ball && b.ball)ball=lerp(a.ball,b.ball,framePosition-frameIndex);
  else if (t < .12) ball = lerp(game.inbounds.find(p=>p.end===play.start)?.frames.at(-1)?.ball ?? (previous ? endBall(previous) : game.tip.spots[game.tip.receiver]),spots[play.handler],t/.12);
  else if((play.outcome==="violation" || play.outcome==="expired" || (play.outcome==="turnover" && !play.stolen)) && t>=.55) ball=spots[play.shooter];
  else if (play.outcome === "turnover" && t >= .55) ball = lerp(play.frames.at(-1)?.ball ?? play.to[play.shooter],spots[play.defender],(t-.55)/.05);
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
  else if (t < .88) { const flight=(t-shotRelease(play))/(.88-shotRelease(play)); ball=lerp(play.shot,play.outcome==="blocked"?lerp(play.shot,play.to[play.defender],.65):hoop,flight); height=motion ? Math.sin(flight*Math.PI)*3 : 0; phase="Shot in the air"; }
  else ball=hoop;
  if (play.outcome === "turnover" && t >= .6) {
    phase=play.stolen?"Transition":"Out of bounds";
    if(!play.stolen || time-replayTime(play,.6)<.8)event={title:"TURNOVER",detail:game.players[play.passer ?? play.shooter].name,tone:"missed"};
  }
  if (["made","missed","blocked"].includes(play.outcome) && t >= .88) {
    phase=play.outcome === "made" ? "Basket" : play.outcome === "blocked" ? "Block" : "Miss";
    event={title:play.outcome === "made" ? `+${play.points}` : play.outcome === "blocked" ? "BLOCK" : "MISS",detail:game.players[play.outcome === "blocked" ? play.defender : play.shooter].name,tone:play.outcome === "made" ? "made" : "missed"};
  }
  if(play.outcome==="violation" && t>=.55) {
    phase="Shot clock violation";event={title:"SHOT CLOCK",detail:"Team turnover",tone:"missed"};
  }
  const reboundStart=play.outcome === "foul" ? .96 : .88;
  if (play.rebounder !== null && t >= reboundStart) {
    ball=lerp(play.outcome==="blocked"?lerp(play.shot,play.to[play.defender],.65):hoop,spots[play.rebounder],(t-reboundStart)/(.98-reboundStart)); height=0;
    if (t >= .98) {phase="Rebound";event={title:Math.floor(play.rebounder/5)===play.side ? "OFFENSIVE REBOUND":"REBOUND",detail:game.players[play.rebounder].name,tone:"neutral"};}
  }
  if (time >= game.playbackDuration) {phase="Final";event=null;}
  const changedHands=play.stolen && t>=.6;
  return {play,spots,ball,height,phase,event,possessionSide:changedHands?(1-play.side) as Side:play.side,
    focus:changedHands || event?.title==="FOUL"?play.defender:t<.55 && a.carrier!==undefined?a.carrier:t<play.passAt?play.handler:play.shooter};
}

/** Elapsed live game time; the replay can be longer because of dead balls. */
export function gameElapsed(game:Simulation,time:number) {
  if(time<game.tip.duration)return Math.max(0,time-game.tip.contact);
  const play=game.plays.find(p=>time<p.end);
  if(!play)return game.duration;
  return Math.min(play.gameEnd,play.gameStart+Math.max(0,time-play.start));
}

/** A possession clock, paused on dead balls and hidden after a legal release. */
export function shotClock(game:Simulation,time:number):number|null {
  if(time>=game.playbackDuration)return null;
  if(time<game.tip.duration)return 24-gameElapsed(game,time);
  const inbound=game.inbounds.find(p=>time>=p.start && time<p.end);
  if(inbound)return 24;
  const play=game.plays.find(p=>time<p.end);
  if(!play)return null;
  const t=playProgress(play,time), elapsed=Math.max(0,time-play.start);
  if(play.outcome==="violation")return Math.max(0,play.shotClockStart-Math.min(elapsed,play.approachSeconds));
  if(t>=.98 && play.rebounder!==null)return (Math.floor(play.rebounder/5)===play.side?14:24)-(play.outcome==="foul"?0:Math.max(0,time-replayTime(play,.98)));
  if(play.outcome==="turnover" && t>=.6)return play.stolen?Math.max(0,24-(time-replayTime(play,.6))):24;
  if(play.outcome==="foul" && t>=.55)return Math.max(0,play.shotClockStart-play.approachSeconds);
  if(["made","missed","blocked"].includes(play.outcome) && t>=shotRelease(play))return null;
  return Math.max(0,play.shotClockStart-elapsed);
}
