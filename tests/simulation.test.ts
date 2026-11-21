import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
import { canSimulate, courtFrame, simulate, simulationState, simulationPlayer, shotQuality, resolvePossession, gameElapsed, moveBodies, shotRelease } from "../lib/simulation";
const players = snapshotSchema.parse(demo).players.filter(canSimulate).slice(0, 10);
const teams: [typeof players, typeof players] = [players.slice(0, 5), players.slice(5)];

test("simulation replay is deterministic and scrubbing cannot reveal future box scores", () => {
  const game = simulate(teams, 120, 42);
  assert.deepEqual(game, simulate(teams, 120, 42));
  assert.notDeepEqual(game, simulate(teams, 120, 43));
  assert.deepEqual(simulationState(game, 0).score, [0, 0]);
  const first = game.plays[0];
  assert.equal(simulationState(game, first.end - .01).completed.length, 0);
  assert.deepEqual(simulationState(game, first.end).lines, first.lines);
  const final = simulationState(game, game.playbackDuration);
  assert.equal(final.completed.length, game.plays.length);
  assert.deepEqual(simulationState(game, 0).score, [0, 0]);
});

test("exhibition score, shot accounting and rebounds stay consistent across different seeds", () => {
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const game = simulate(teams, 300, seed);
    assert.equal(game.plays.at(-1)?.gameEnd, 300);
    for(const inbound of game.inbounds)assert.ok(inbound.release>=inbound.start && inbound.release<inbound.end);
    const final = simulationState(game, game.playbackDuration);
    for (const side of [0, 1]) assert.equal(final.score[side], final.lines.slice(side*5, side*5+5).reduce((sum, l) => sum+l.pts, 0));
    for (const l of final.lines) {
      assert.equal(l.pts, 2*l.fgm + l.tpm + l.ftm);
      assert.ok(l.fgm <= l.fga && l.tpm <= l.tpa && l.tpa <= l.fga && l.tpm <= l.fgm && l.ftm <= l.fta);
      assert.ok(Object.values(l).every(n => Number.isInteger(n) && n >= 0));
    }
    const total = (key: keyof typeof final.lines[number]) => final.lines.reduce((sum, l) => sum+l[key], 0);
    assert.equal(total("reb"), game.plays.filter(p => p.rebounder !== null).length);
    assert.equal(total("to"), game.plays.filter(p => p.outcome === "turnover").length);
    assert.equal(total("pf"), game.plays.filter(p => p.outcome === "foul").length);
    assert.equal(total("blk"), game.plays.filter(p => p.outcome === "blocked").length);
    assert.ok(total("ast") <= total("fgm"));
    game.plays.forEach(p => { outcomes.add(p.outcome); assert.ok(p.end > p.start); });
    for (let t = 0; t <= game.playbackDuration; t += 3) {
      const frame = courtFrame(game, t);
      assert.equal(frame.spots.length, 10);
      for (const p of [...frame.spots, frame.ball]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 94 && p.y >= 0 && p.y <= 50);
    }
  }
  assert.deepEqual([...outcomes].sort(), ["blocked", "foul", "made", "missed", "turnover"]);
});

test("invalid lineups and insufficient player data cannot silently enter an exhibition", () => {
  assert.throws(() => simulate([teams[0], teams[0]]), /different players/);
  assert.throws(() => simulate([teams[0].slice(1), teams[1]]), /five per team/);
  assert.throws(() => simulate(teams, 0), /settings/);
  assert.equal(canSimulate({...players[0], stats:{...players[0].stats, FGA:null}}), false);
  assert.equal(canSimulate({...players[0], stats:{...players[0].stats, MIN:0}}), false);
  assert.equal(canSimulate({...players[0], gamesPlayed:0}), false);
  assert.throws(() => simulate([[{...players[0], gamesPlayed:0}, ...teams[0].slice(1)], teams[1]]), /complete stats/);
});

test("fantasy power does not control game results, and a running game retains its input snapshot", () => {
  const game = simulate(teams, 120, 42);
  const changed = teams.map(t => t.map(p => ({...p, power:0, zTotal:-100, rank:1000}))) as typeof teams;
  assert.deepEqual(simulate(changed, 120, 42), game);
  const saved = game.players[0].name;
  changed[0][0].name = "Changed upstream";
  assert.equal(game.players[0].name, saved);
});


test("shot decisions value space and account for nearby rim protection", () => {
  const shooter = simulationPlayer(players[0]);
  const defender = {...simulationPlayer(players[5]), block: 0};
  const shot = {x:64,y:25};
  const open = shotQuality(shooter,shot,[{spot:{x:74,y:25},player:defender}],0,true);
  const contested = shotQuality(shooter,shot,[{spot:{x:65,y:25},player:defender}],0,true);
  assert.ok(open.chance > contested.chance + .1);
  const rim = {x:85,y:25}, spot = {x:87,y:25};
  assert.ok(shotQuality(shooter,rim,[{spot,player:{...defender,block:4}}],0,false).chance < shotQuality(shooter,rim,[{spot,player:defender}],0,false).chance);
  const mirrored = shotQuality(shooter,{x:30,y:25},[{spot:{x:20,y:25},player:defender}],1,true);
  assert.equal(mirrored.chance,open.chance);
});

test("non-shooters avoid threes and play decisions stay attached to the actual defenders", () => {
  const noThrees = (team: typeof players) => team.map(p=>({...p,stats:{...p.stats,"3PM":0}}));
  const nonShooters: typeof teams = [noThrees(teams[0]), noThrees(teams[1])];
  let attempts=0, threes=0;
  for (let seed=0;seed<20;seed++) {
    const game = simulate(nonShooters,300,seed);
    attempts+=game.plays.length; threes+=game.plays.filter(p=>p.three).length;
    for (const play of game.plays) {
      assert.ok(play.shotChance >= .12 && play.shotChance <= .82);
      assert.equal(Math.floor(play.handler/5),play.side);
      assert.equal(Math.floor(play.shooter/5),play.side);
      assert.notEqual(Math.floor(play.defender/5),play.side);
      if (play.passer !== null) assert.notEqual(play.passer,play.shooter);
    }
  }
  assert.ok(threes/attempts < .06); // Physical end-clock shots may be outside the arc; non-shooters still overwhelmingly stay inside.
});

test("fouls appear at the whistle and free throws reveal one attempt at a time", () => {
  const game = Array.from({length:10},(_,seed)=>simulate(teams,600,seed)).find(g=>g.plays.some(p=>p.outcome==="foul"))!;
  const foul = game.plays.find(p=>p.outcome === "foul");
  assert.ok(foul);
  const at = (progress:number) => foul.start+(foul.end-foul.start)*progress;
  const before = simulationState(game,at(.54));
  const whistle = simulationState(game,at(.56));
  assert.equal(courtFrame(game,at(.56)).event?.title,"FOUL");
  assert.equal(whistle.lines[foul.defender].pf,before.lines[foul.defender].pf+1);
  assert.equal(whistle.lines[foul.shooter].fta,before.lines[foul.shooter].fta);
  const firstResult = simulationState(game,at(.65+.31*.81/foul.freeThrows.length));
  assert.equal(firstResult.lines[foul.shooter].fta,before.lines[foul.shooter].fta+1);
  assert.equal(firstResult.lines[foul.shooter].ftm,before.lines[foul.shooter].ftm+Number(foul.freeThrows[0]));
  assert.ok(courtFrame(game,at(.7)).event?.title.startsWith("FREE THROW"));
  assert.deepEqual(simulationState(game,at(.999)).score,foul.score);
  assert.deepEqual(simulationState(game,at(.999)).lines,foul.lines);
  assert.deepEqual(simulationState(game,at(.54)),before); // Seeking back removes future stats.
});

test("possession changes preserve ball and player positions, including after free throws", () => {
  const game = simulate(teams,600,11);
  for (let i=1;i<game.plays.length;i++) {
    const at=game.plays[i].start;
    const before=courtFrame(game,at-.00001), after=courtFrame(game,at);
    for (let n=0;n<10;n++) assert.ok(Math.hypot(before.spots[n].x-after.spots[n].x,before.spots[n].y-after.spots[n].y)<.01);
    assert.ok(Math.hypot(before.ball.x-after.ball.x,before.ball.y-after.ball.y)<.01);
  }
});

test("live shot results and totals agree before a possession finishes", () => {
  const game=simulate(teams,600,11);
  for (const play of game.plays) {
    const at=(p:number)=>play.start+(play.end-play.start)*p;
    assert.equal(courtFrame(game,at(.3)).event,null);
    const state=simulationState(game,at(.999));
    assert.deepEqual(state.score,play.score);
    assert.deepEqual(state.lines,play.lines);
  }
});


test("free throws stop the game clock while the replay and shot stats continue", () => {
  const game=Array.from({length:10},(_,seed)=>simulate(teams,600,seed)).find(g=>g.plays.some(p=>p.outcome==="foul"))!;
  const foul=game.plays.find(p=>p.outcome==="foul")!;
  const at=(t:number)=>foul.start+(foul.end-foul.start)*t;
  assert.ok(game.playbackDuration>game.duration);
  assert.ok(gameElapsed(game,at(.4))<gameElapsed(game,at(.55)));
  for(const t of [.55,.65,.8,.96,.999]) assert.equal(gameElapsed(game,at(t)),foul.gameEnd);
  assert.equal(simulationState(game,at(.96)).lines[foul.shooter].fta,simulationState(game,at(.54)).lines[foul.shooter].fta+foul.freeThrows.length);
  const next=game.plays[game.plays.indexOf(foul)+1];
  assert.equal(gameElapsed(game,next.start),foul.gameEnd);
  assert.ok(gameElapsed(game,next.start+1)>foul.gameEnd);
  assert.equal(gameElapsed(game,game.playbackDuration),600);
});

test("defenders follow drives and a blocked lane changes the attack before the shot", () => {
  const ps=players.map(simulationPlayer);
  const setup=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  const intent={shooter:0,shot:{x:86,y:24},three:false,action:"drive" as const,chance:.6,value:1.2};
  const defended=resolvePossession(ps,0,0,setup,setup,intent,3.5);
  assert.ok(defended.frames.some(f=>f.phase.includes("contains")));
  assert.ok(defended.frames.some(f=>f.phase.includes("Pull-up") || f.phase==="Kick-out"));
  assert.ok(Math.hypot(defended.to[5].x-setup[5].x,defended.to[5].y-setup[5].y)>2);
  const open=setup.map(p=>({...p}));for(let i=5;i<10;i++)open[i]={x:40,y:3+(i-5)*10};
  const unguarded=resolvePossession(ps,0,0,open,open,intent,3.5);
  const forward=(plan:typeof defended)=>Math.max(...plan.frames.map(f=>f.spots[0].x));
  assert.ok(forward(unguarded)>forward(defended)+3);
});

test("moving bodies stay separated and shot odds use the positions shown on court",()=>{
  for(let seed=0;seed<12;seed++) {
    const game=simulate(teams,120,seed);
    for(const play of game.plays) {
      for(const frame of [...play.frames,...play.finishFrames]) for(let i=0;i<10;i++) for(let j=i+1;j<10;j++) {
        assert.ok(Math.hypot(frame.spots[i].x-frame.spots[j].x,frame.spots[i].y-frame.spots[j].y)>3.7);
      }
      const defenders=game.players.map((player,i)=>({player,spot:play.to[i],i})).filter(d=>Math.floor(d.i/5)!==play.side);
      assert.equal(play.shotChance,shotQuality(game.players[play.shooter],play.shot,defenders,play.side,play.three).chance);
      assert.ok(play.passAt<play.passEnd && play.passEnd<=.55);
      assert.equal(courtFrame(game,play.start+(play.end-play.start)*.54).spots.length,10);
    }
  }
});


test("drives can draw help and pass out before defenders recover",()=>{
  let helped=false, kicked=false, retained=false;
  for(let seed=0;seed<15;seed++) for(const play of simulate(teams,120,seed).plays) {
    const phases=play.frames.map(f=>f.phase);
    helped ||= phases.includes("Help defense");
    if(phases.includes("Kick-out")) {
      kicked=true; assert.notEqual(play.handler,play.shooter); assert.equal(play.passer,play.handler);
      assert.ok(play.passAt>=.11 && play.passEnd>play.passAt);
    }
    retained ||= play.action==="drive" || (phases.some(p=>p.includes("contains")) && play.action==="pull-up");
  }
  assert.ok(helped && kicked && retained);
});


test("games open at center court and the clock starts at the tap",()=>{
  const game=simulate(teams,120,7), tip=game.tip;
  assert.deepEqual(courtFrame(game,0).ball,{x:47,y:25});
  assert.equal(courtFrame(game,0).event?.title,"TIP-OFF");
  assert.equal(gameElapsed(game,0),0);assert.equal(gameElapsed(game,tip.contact-.01),0);
  assert.ok(gameElapsed(game,tip.contact+.1)>0);
  assert.equal(game.plays[0].side,tip.winner);
  const before=courtFrame(game,tip.duration-.00001),after=courtFrame(game,tip.duration);
  before.spots.forEach((p,i)=>assert.ok(Math.hypot(p.x-after.spots[i].x,p.y-after.spots[i].y)<.01));
  assert.ok(Math.hypot(before.ball.x-after.ball.x,before.ball.y-after.ball.y)<.01);
  assert.equal(gameElapsed(game,tip.duration),game.plays[0].gameStart);
  assert.deepEqual(simulationState(game,tip.duration).score,[0,0]);
});


test("opposing players settle at contact without bouncing or passing through",()=>{
  let spots=[{x:40,y:25},{x:44,y:25}], velocities=spots.map(()=>({x:0,y:0}));
  const goals=[{x:50,y:25},{x:34,y:25}], tail:number[]=[];
  for(let frame=0;frame<300;frame++) {
    ({spots,velocities}=moveBodies(spots,velocities,goals,[12,12],1/30));
    assert.ok(spots[1].x-spots[0].x>=3.94);
    if(frame>240)tail.push(spots[0].x);
  }
  assert.ok(Math.max(...tail)-Math.min(...tail)<.001);
  assert.ok(velocities.every(v=>Math.hypot(v.x,v.y)<.001));
});

test("contact preserves sideways movement and a crowded boundary stays stable",()=>{
  let spots=[{x:40,y:25},{x:43.95,y:25}], velocities=spots.map(()=>({x:0,y:0}));
  for(let frame=0;frame<90;frame++) {
    ({spots,velocities}=moveBodies(spots,velocities,[{x:50,y:35},{x:34,y:35}],[12,12],1/30));
    assert.ok(Math.hypot(spots[0].x-spots[1].x,spots[0].y-spots[1].y)>3.94);
  }
  assert.ok(spots.every(p=>p.y>34)); // They slide along contact rather than freezing.
  spots=[{x:84,y:25},{x:88,y:25},{x:92,y:25}];velocities=spots.map(()=>({x:0,y:0}));
  const tail:number[]=[];
  for(let frame=0;frame<300;frame++) {
    ({spots,velocities}=moveBodies(spots,velocities,spots.map(()=>({x:98,y:25})),[14,14,14],1/30));
    assert.ok(spots.every(p=>p.x<=92 && p.x>=2));
    assert.ok(spots[1].x-spots[0].x>3.9 && spots[2].x-spots[1].x>3.9);
    if(frame>240)tail.push(spots[0].x);
  }
  assert.ok(Math.max(...tail)-Math.min(...tail)<.001);
});

test("crowded possessions avoid repeated abrupt frame reversals",()=>{
  let reversals=0, movements=0;
  for(let seed=0;seed<12;seed++) for(const play of simulate(teams,120,seed).plays) {
    const frames=[...play.frames,...play.finishFrames];
    for(let t=2;t<frames.length;t++) for(let i=0;i<10;i++) {
      const [a,b,c]=[t-2,t-1,t].map(n=>frames[n].spots[i]);
      const v={x:b.x-a.x,y:b.y-a.y}, w={x:c.x-b.x,y:c.y-b.y};
      const speed=Math.hypot(v.x,v.y), nextSpeed=Math.hypot(w.x,w.y);
      if(speed>.03 && nextSpeed>.03 && v.x*w.x+v.y*w.y<-.5*speed*nextSpeed)reversals++;
      movements++;
    }
  }
  // Allow real tactical changes, but reject alternating-frame collision vibration.
  // The previous positional-push solver reversed on nearly half of these samples.
  assert.ok(reversals/movements<.002,`${reversals} abrupt reversals in ${movements} samples`);
});


test("off-ball players cut and relocate even after arriving at their formation",()=>{
  const ps=players.map(simulationPlayer);
  const setup=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  const intent={shooter:0,shot:{x:80,y:25},three:false,action:"cut" as const,chance:.3,value:.9};
  const result=resolvePossession(ps,0,0,setup,setup,intent,8);
  const before=result.frames[0].spots;
  const movers=[1,2,3,4].filter(i=>Math.hypot(before[i].x-result.to[i].x,before[i].y-result.to[i].y)>4);
  assert.ok(movers.length>=3,`Only ${movers.length} off-ball players repositioned`);
  // Tactical coordinates mirror correctly when attacking the other basket.
  const mirrored=setup.map(p=>({x:94-p.x,y:p.y}));
  const mirrorPlayers=[...ps.slice(5),...ps.slice(0,5)];
  const reordered=[...mirrored.slice(5),...mirrored.slice(0,5)];
  const reverse=resolvePossession(mirrorPlayers,1,5,reordered,reordered,{...intent,shooter:5,shot:{x:14,y:25}},8);
  result.to.forEach((p,i)=>assert.ok(Math.hypot(94-p.x-reverse.to[(i+5)%10].x,p.y-reverse.to[(i+5)%10].y)<.05));
});

test("shots keep off-ball players moving while the ball follows its fixed release point",()=>{
  let checked=0;
  for(let seed=0;seed<8;seed++) {
    const game=simulate(teams,120,seed);
    for(const play of game.plays.filter(p=>["made","missed","blocked"].includes(p.outcome) && p.end-p.start>10)) {
      const at=(t:number)=>courtFrame(game,play.start+(play.end-play.start)*t);
      // Measure the first second of shot preparation/flight, before players reach box-out spots.
      const early=at(.55),late=at(.55+1/(play.end-play.start));
      const movers=early.spots.filter((p,i)=>i!==play.shooter && Math.hypot(p.x-late.spots[i].x,p.y-late.spots[i].y)>1);
      assert.ok(movers.length>=4,`Only ${movers.length} players moved during shot flight`);
      const flight=(.8-shotRelease(play))/(.88-shotRelease(play)),hoop={x:play.side===0?88.75:5.25,y:25};
      const ball=at(.8).ball;
      assert.ok(Math.hypot(ball.x-(play.shot.x+(hoop.x-play.shot.x)*flight),ball.y-(play.shot.y+(hoop.y-play.shot.y)*flight))<.00001);
      for(const boundary of [.55,.65,.72,.88,.98]) {
        const a=at(boundary-.000001),b=at(boundary+.000001);
        a.spots.forEach((p,i)=>assert.ok(Math.hypot(p.x-b.spots[i].x,p.y-b.spots[i].y)<.01));
      }
      checked++;
    }
  }
  assert.ok(checked>20);
});


test("rebound winners come from teammates within reach of the rim",()=>{
  for(let seed=0;seed<12;seed++) {
    const game=simulate(teams,120,seed);
    for(const play of game.plays.filter(p=>p.rebounder!==null && p.outcome!=="foul")) {
      const frame=courtFrame(game,play.start+(play.end-play.start)*.875),hoop={x:play.side===0?88.75:5.25,y:25};
      const distance=(i:number)=>Math.hypot(frame.spots[i].x-hoop.x,frame.spots[i].y-hoop.y);
      const side=Math.floor(play.rebounder!/5),team=Array.from({length:5},(_,i)=>side*5+i);
      assert.ok(distance(play.rebounder!)<=Math.min(...team.map(distance))+5.5);
    }
  }
});

test("ready shooters release promptly and shot attempts appear at release",()=>{
  const ps=players.map(simulationPlayer);
  const setup=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  const result=resolvePossession(ps,0,0,setup,setup,{shooter:0,shot:{x:63,y:25},three:true,action:"pull-up",chance:.3,value:.9},10);
  assert.ok(result.seconds<1.5,`Ready shooter waited ${result.seconds}s`);
  let checked=0;
  for(let seed=0;seed<8;seed++) {
    const game=simulate(teams,120,seed);
    for(const play of game.plays) {
      assert.ok(play.passAt<play.passEnd && play.passEnd<=.55);
      if(!["made","missed","blocked"].includes(play.outcome))continue;
      const length=play.end-play.start,release=shotRelease(play);
      assert.ok((release-.55)*length<=.200001);
      const before=simulationState(game,play.start+length*release-.00001).lines[play.shooter];
      const after=simulationState(game,play.start+length*release+.00001).lines[play.shooter];
      assert.equal(after.fga,before.fga+1);
      checked++;
    }
  }
  assert.ok(checked>20);
});

test("turnovers flow into staggered lanes and retain the new ball handler",()=>{
  const sides=new Set<number>(); let checked=0;
  for(let seed=0;seed<60;seed++) {
    const game=simulate(teams,120,seed);
    game.plays.forEach((play,index)=>{
      if(play.outcome!=="turnover" || play.end-play.start<10)return;
      const length=play.end-play.start;
      const change=courtFrame(game,play.start+length*.6+.001);
      assert.equal(change.event?.title,"TURNOVER");
      assert.equal(change.possessionSide,1-play.side);
      const running=courtFrame(game,play.start+length*.6+.9);
      assert.equal(running.event,null);
      assert.equal(running.phase,"Transition");
      assert.equal(running.focus,play.defender);
      assert.ok(Math.hypot(running.ball.x-running.spots[play.defender].x,running.ball.y-running.spots[play.defender].y)<.000001);
      const end=play.finishFrames.at(-1)!.spots;
      const xs=end.map(p=>play.side===0?p.x:94-p.x);
      assert.ok(Math.max(...xs)-Math.min(...xs)>15,"Players formed a midcourt line");
      assert.ok(xs.some(x=>x<40),"Nobody advanced beyond midcourt");
      const next=game.plays[index+1];
      if(next)assert.equal(next.handler,play.defender);
      sides.add(play.side);checked++;
    });
  }
  assert.equal(sides.size,2);
  assert.ok(checked>=10);
});

test("made baskets have a visible pickup and inbound before the clock resumes",()=>{
  let checked=0;const sides=new Set<number>();
  for(let seed=0;seed<12;seed++) {
    const game=simulate(teams,120,seed);
    for(const inbound of game.inbounds) {
      assert.ok(inbound.release>=inbound.start && inbound.release<inbound.end);
      assert.notEqual(inbound.inbounder,inbound.receiver);
      for(const frame of inbound.frames)for(let i=0;i<10;i++)for(let j=i+1;j<10;j++)
        assert.ok(Math.hypot(frame.spots[i].x-frame.spots[j].x,frame.spots[i].y-frame.spots[j].y)>3.7);
      const before=game.plays.find(p=>p.end===inbound.start)!;
      const next=game.plays.find(p=>p.start===inbound.end)!;
      assert.ok(before.outcome==="made" || before.freeThrows.at(-1));
      const start=courtFrame(game,inbound.start),release=courtFrame(game,inbound.release);
      const baselineX=inbound.side===0?2:92;
      assert.ok(Math.abs(release.spots[inbound.inbounder].x-baselineX)<.6);
      assert.ok(Math.hypot(release.ball.x-release.spots[inbound.inbounder].x,release.ball.y-release.spots[inbound.inbounder].y)<.6);
      assert.equal(start.phase,"Collecting ball");
      assert.equal(gameElapsed(game,inbound.start),gameElapsed(game,inbound.end));
      assert.deepEqual(simulationState(game,inbound.release).lines,before.lines);
      for(const boundary of [inbound.start,inbound.release,inbound.end]) {
        const a=courtFrame(game,boundary-.000001),b=courtFrame(game,boundary+.000001);
        assert.ok(Math.hypot(a.ball.x-b.ball.x,a.ball.y-b.ball.y)<.01);
        a.spots.forEach((p,i)=>assert.ok(Math.hypot(p.x-b.spots[i].x,p.y-b.spots[i].y)<.01));
      }
      assert.equal(next.handler,inbound.receiver);
      assert.ok(gameElapsed(game,inbound.end+.1)>before.gameEnd);
      sides.add(inbound.side);checked++;
    }
  }
  assert.equal(sides.size,2);assert.ok(checked>20);
});
