import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
import { canSimulate, courtFrame, simulate, simulationState, simulationPlayer, shotQuality, resolvePossession, gameElapsed, moveBodies, shotRelease, replayTime, shotClock, resolveFastBreak, transitionDefense, blockCandidates, playerStyle, supportRoute, chooseShot, defensiveStyle, defensiveGap, screenSwitchChance, selectHelper } from "../lib/simulation";
const players = snapshotSchema.parse(demo).players.filter(canSimulate).slice(0, 10);
const teams: [typeof players, typeof players] = [players.slice(0, 5), players.slice(5)];

test("player tendencies produce distinct perimeter, interior and passing-big routes without name overrides",()=>{
  const base=simulationPlayer(players[0]);
  const wing={...base,position:"SG",threeShare:.7,passing:3,rebound:4,usage:20};
  const big={...base,position:"C",threeShare:.03,passing:2,rebound:14,usage:17};
  const hub={...big,passing:10};
  assert.ok(playerStyle(wing).relocation>playerStyle(big).relocation+.4);
  assert.ok(playerStyle(big).screening>playerStyle(wing).screening+.4);
  assert.deepEqual(playerStyle(wing),playerStyle({...wing,id:999,name:"Different name",nbaTeam:"XYZ"}));
  const origin={x:85,y:7};
  const shooterTarget=supportRoute(wing,origin,0,1,false,false);
  const rimTarget=supportRoute(big,origin,0,1,false,false);
  const hubTarget=supportRoute(hub,origin,0,1,false,false);
  assert.ok(Math.hypot(shooterTarget.x-88.75,shooterTarget.y-25)>23.75,"Shooter lifts behind the arc");
  assert.ok(Math.hypot(rimTarget.x-88.75,rimTarget.y-25)<12,"Interior player stays available near the basket");
  assert.ok(hubTarget.x>70 && hubTarget.x<80,"Passing big finds the elbow");
  for(const p of [wing,big,hub]) {
    const a=supportRoute(p,origin,0,.6,false,false),b=supportRoute(p,{x:9,y:7},1,.6,false,false);
    assert.ok(Math.hypot(94-a.x-b.x,a.y-b.y)<1e-9);
  }
  const setup=[{x:62,y:25},origin,{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:11},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  const intent={shooter:0,shot:{x:80,y:25},three:false,action:"cut" as const,chance:.3,value:.9};
  const run=(profile:typeof base)=>resolvePossession(players.map((p,i)=>i===1?profile:simulationPlayer(p)),0,0,setup,setup,intent,8);
  const shooterMotion=run(wing),hubMotion=run(hub);
  assert.ok(Math.hypot(shooterMotion.to[1].x-hubMotion.to[1].x,shooterMotion.to[1].y-hubMotion.to[1].y)>5,"Profiles must change stored court movement, not just labels");
});

test("play selection favors moving shooters, rolling bigs, stretch pops and passing-hub handoffs",()=>{
  const base=simulationPlayer(players[0]);
  const creator={...base,position:"PG",passing:9,usage:24,rebound:4,threeShare:.4};
  const wing={...base,position:"SG",passing:3,usage:20,rebound:4,threeShare:.7};
  const big={...base,position:"C",passing:2,usage:18,rebound:14,threeShare:.02};
  const spot=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  const sample=(handler:typeof base,screener:typeof base)=>{
    let state=2718;
    const rng=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const roster=[handler,wing,{...wing,threeShare:.02},{...wing,threeShare:.25},screener,...players.slice(5).map(simulationPlayer)];
    return Array.from({length:1200},()=>chooseShot(roster,0,0,spot,rng));
  };
  const normal=sample(creator,big),stretch=sample(creator,{...big,threeShare:.6});
  const hub=sample({...big,passing:10},big);
  assert.ok(normal.filter(p=>p.movement?.receiver===1).length>normal.filter(p=>p.movement?.receiver===2).length*2,"Moving shooter gets more designed catches than non-shooter");
  assert.ok(normal.filter(p=>p.screen?.screener===4).length>normal.filter(p=>p.screen?.screener===1).length*3,"Big sets more ball screens than guard");
  assert.equal(normal.filter(p=>p.screen?.screener===4 && p.screen.mode==="pop").length,0);
  assert.ok(stretch.filter(p=>p.screen?.screener===4 && p.screen.mode==="pop").length>100);
  assert.ok(hub.filter(p=>p.movement?.kind==="handoff").length>normal.filter(p=>p.movement?.kind==="handoff").length*1.5);
});

test("defensive profiles change real pressure, paint coverage and transition jobs without name overrides",()=>{
  const base=simulationPlayer(players[0]);
  const pressure={...base,position:"PG",steal:3,block:.1,rebound:3};
  const rim={...base,position:"C",steal:.4,block:4,rebound:15};
  assert.ok(defensiveStyle(pressure).pressure>defensiveStyle(rim).pressure+.5);
  assert.ok(defensiveStyle(rim).rim>defensiveStyle(pressure).rim+.7);
  assert.deepEqual(defensiveStyle(rim),defensiveStyle({...rim,name:"Other",id:999}));
  assert.ok(defensiveGap(pressure,base,true)<defensiveGap(rim,base,true)-1);
  assert.ok(screenSwitchChance(pressure,pressure)>screenSwitchChance(pressure,rim)+.3);
  const setup=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:68,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  const roster=players.map(simulationPlayer);
  const run=(profile:typeof base)=>resolvePossession(roster.map((p,i)=>i===5?profile:p),0,0,setup,setup,
    {shooter:1,shot:setup[1],three:true,action:"catch-and-shoot",chance:.3,value:.9},3);
  const tight=run(pressure),deep=run(rim);
  assert.ok(deep.to[5].x-tight.to[5].x>.5,"Cushion must change stored defender movement");
  const spots=[{x:65,y:25},{x:60,y:5},{x:55,y:45},{x:45,y:10},{x:30,y:40},
    {x:72,y:21},{x:72,y:29},{x:40,y:4},{x:40,y:46},{x:30,y:25}];
  roster[5]=pressure;roster[6]=rim;
  const a=transitionDefense(roster,0,0,spots,{x:10,y:0});
  assert.equal(a.roles.stopper,5);assert.equal(a.roles.rim,6);
  roster[5]=rim;roster[6]=pressure;
  const b=transitionDefense(roster,0,0,spots,{x:10,y:0});
  assert.equal(b.roles.stopper,6);assert.equal(b.roles.rim,5);
  // Role preferences cannot teleport a far-away specialist over a reachable defender.
  spots[5]={x:20,y:25};
  assert.equal(transitionDefense(roster,0,0,spots,{x:10,y:0}).roles.stopper,6);
});

test("help defense favors nearby rim protection but accounts for leaving shooters",()=>{
  const ps=players.map(simulationPlayer);
  const rim={...ps[6],position:"C",steal:.4,block:4,rebound:15};
  ps[6]=rim;ps[7]=rim;
  ps[1]={...ps[1],threeShare:.75};ps[2]={...ps[2],threeShare:0};
  const spots=[{x:76,y:25},{x:86,y:4},{x:86,y:46},{x:60,y:4},{x:60,y:46},
    {x:79,y:25},{x:83,y:19},{x:83,y:31},{x:60,y:10},{x:60,y:40}];
  const assignments=new Map([[0,5],[1,6],[2,7],[3,8],[4,9]]);
  assert.equal(selectHelper(ps,0,0,spots,assignments),7,"Help off the non-shooter when reach is equal");
  assert.ok(defensiveGap(rim,ps[2],false)>defensiveGap(rim,ps[1],false)+1,"Paint bias should not abandon a perimeter threat");
  spots[7]={x:40,y:25};
  assert.equal(selectHelper(ps,0,0,spots,assignments),6,"Distance overrides preferred help assignment");
  spots[0]={x:60,y:25};
  assert.equal(selectHelper(ps,0,0,spots,assignments),null,"Do not collapse on a distant ball handler");
});

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
  assert.deepEqual([...outcomes].sort(), ["blocked", "expired", "foul", "made", "missed", "turnover", "violation"]);
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
  const at = (progress:number) => replayTime(foul,progress);
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
    const at=(p:number)=>replayTime(play,p);
    assert.equal(courtFrame(game,at(.3)).event,null);
    const state=simulationState(game,at(.999));
    assert.deepEqual(state.score,play.score);
    assert.deepEqual(state.lines,play.lines);
  }
});


test("free throws stop the game clock while the replay and shot stats continue", () => {
  const game=Array.from({length:10},(_,seed)=>simulate(teams,600,seed)).find(g=>g.plays.some(p=>p.outcome==="foul"))!;
  const foul=game.plays.find(p=>p.outcome==="foul")!;
  const at=(t:number)=>replayTime(foul,t);
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
  assert.ok(forward(unguarded)>forward(defended));
  assert.ok(defended.seconds>unguarded.seconds+.5,"Containment delays the attempt even when the helper rotates from deeper in the paint");
  assert.ok(defended.shooter!==0 || defended.action==="pull-up","A covered drive must pass out or settle for a jumper");
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
      assert.equal(courtFrame(game,replayTime(play,.54)).spots.length,10);
    }
  }
});


test("drives can draw help and pass out before defenders recover",()=>{
  let helped=false, kicked=false, retained=false;
  for(let seed=0;seed<15;seed++) for(const play of simulate(teams,120,seed).plays) {
    const phases=play.frames.map(f=>f.phase);
    helped ||= phases.includes("Help defense");
    if(phases.includes("Kick-out") && !play.fastBreak) {
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
      const at=(t:number)=>courtFrame(game,replayTime(play,t));
      // Measure the first second of shot preparation/flight, before players reach box-out spots.
      const early=at(.55),late=courtFrame(game,replayTime(play,.55)+1);
      const movers=early.spots.filter((p,i)=>i!==play.shooter && Math.hypot(p.x-late.spots[i].x,p.y-late.spots[i].y)>1);
      assert.ok(movers.length>=4,`Only ${movers.length} players moved during shot flight`);
      const flight=(.8-shotRelease(play))/(.88-shotRelease(play)),hoop=play.outcome==="blocked"?{x:play.shot.x+(play.to[play.defender].x-play.shot.x)*.65,y:play.shot.y+(play.to[play.defender].y-play.shot.y)*.65}:{x:play.side===0?88.75:5.25,y:25};
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


test("rebound winners come from teammates within reach of the loose ball",()=>{
  for(let seed=0;seed<12;seed++) {
    const game=simulate(teams,120,seed);
    for(const play of game.plays.filter(p=>p.rebounder!==null && p.outcome!=="foul")) {
      const frame=courtFrame(game,replayTime(play,.875)),hoop=play.outcome==="blocked"?{x:play.shot.x+(play.to[play.defender].x-play.shot.x)*.65,y:play.shot.y+(play.to[play.defender].y-play.shot.y)*.65}:{x:play.side===0?88.75:5.25,y:25};
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
      assert.ok(replayTime(play,release)-replayTime(play,.55)<=.200001);
      const before=simulationState(game,replayTime(play,release)-.00001).lines[play.shooter];
      const after=simulationState(game,replayTime(play,release)+.00001).lines[play.shooter];
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
      if(!play.stolen || play.end-play.start<10)return;
      const length=play.end-play.start;
      const change=courtFrame(game,replayTime(play,.6)+.001);
      assert.equal(change.event?.title,"TURNOVER");
      assert.equal(change.possessionSide,1-play.side);
      const running=courtFrame(game,replayTime(play,.6)+.9);
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
      assert.ok(before.outcome==="made" || before.outcome==="violation" || (before.outcome==="turnover" && !before.stolen) || before.freeThrows.at(-1));
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

test("screens set before use, then roll or pop with distinct defensive coverages",()=>{
  const ps=players.map(simulationPlayer);
  const setup=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  for(const mode of ["roll","pop"] as const)for(const coverage of ["switch","drop"] as const) {
    const intent={shooter:0,shot:{x:78,y:25},three:false,action:"drive" as const,chance:0,value:0,
      screen:{screener:4,mode,coverage,direction:1 as const}};
    const result=resolvePossession(ps,0,0,setup,setup,intent,12);
    const frames=result.frames, use=frames.findIndex(f=>f.phase.startsWith("Screen ·"));
    const read=frames.findIndex(f=>f.phase===`Pick-and-${mode}`);
    assert.ok(use>0 && read>use,"The guard must wait for the screen before using it");
    const set=frames[use].spots[4];
    assert.ok(Math.hypot(set.x-67,set.y-29.5)<.7);
    const before=frames[use-6].spots[4];
    assert.ok(Math.hypot(set.x-before.x,set.y-before.y)<.3,"Screen must be planted");
    const route=frames[Math.min(read+35,frames.length-1)].spots[4];
    assert.ok(mode==="roll"?route.x>set.x+3:Math.hypot(route.x-88.75,route.y-25)>Math.hypot(set.x-88.75,set.y-25)+1,"Screener must roll toward the rim or pop to the perimeter");
    assert.ok(frames[read].spots[0].y>32,"Guard must turn the screen's outside corner");
    const mirrored=resolvePossession(ps.slice(5).concat(ps.slice(0)),1,5,setup.slice(5).concat(setup.slice(0)).map(p=>({x:94-p.x,y:p.y})),
      setup.slice(5).concat(setup.slice(0)).map(p=>({x:94-p.x,y:p.y})),
      {...intent,shooter:5,shot:{x:16,y:25},screen:{...intent.screen,screener:9}},12);
    // Geometry and phases do not depend on which basket the offense attacks.
    const mirrorUse=mirrored.frames.find(f=>f.phase.startsWith("Screen ·"))!;
    const mirrorRead=mirrored.frames.find(f=>f.phase===`Pick-and-${mode}`)!;
    assert.ok(Math.hypot(mirrorUse.spots[9].x-(94-set.x),mirrorUse.spots[9].y-set.y)<.7);
    assert.ok(mirrorRead.spots[5].y>32);
    const mirrorRoute=mirrored.frames[Math.min(mirrored.frames.indexOf(mirrorRead)+35,mirrored.frames.length-1)].spots[9];
    assert.ok(mode==="roll"?mirrorRoute.x<mirrorUse.spots[9].x-3:Math.hypot(mirrorRoute.x-5.25,mirrorRoute.y-25)>Math.hypot(mirrorUse.spots[9].x-5.25,mirrorUse.spots[9].y-25)+1);
    assert.ok(mirrored.frames.some(f=>f.phase===`Pick-and-${mode}`));
    assert.ok(mirrored.frames.every(f=>f.spots.every(p=>p.x>=2 && p.x<=92 && p.y>=2 && p.y<=48)));
  }
});

test("screen reads vary between handler, roller and kick-out without replacing the whole playbook",()=>{
  const finishes=new Set<string>(), modes=new Set<string>(), coverage=new Set<string>(), sides=new Set<number>();
  let screens=0, ordinary=0, completed=0;
  for(let seed=0;seed<20;seed++)for(const play of simulate(teams,120,seed).plays) {
    if(!play.screen){ordinary++;continue;}
    screens++;modes.add(play.screen.mode);coverage.add(play.screen.coverage);sides.add(play.side);
    if(!play.frames.some(f=>f.phase.startsWith("Pick-and-")))continue;
    completed++;
    finishes.add(play.shooter===play.handler?"handler":play.shooter===play.screen.screener?"screener":"kick-out");
    assert.ok(play.passEnd>play.passAt);
    if(play.passer!==null && !play.fastBreak)assert.equal(play.passer,play.handler);
  }
  assert.deepEqual([...finishes].sort(),["handler","kick-out","screener"]);
  assert.equal(modes.size,2);assert.equal(coverage.size,2);assert.equal(sides.size,2);
  assert.ok(screens>20 && ordinary>screens && completed>screens*.8);
});

test("handoffs exchange at close range and off-ball screens plant before the receiver curls",()=>{
  const ps=players.map(simulationPlayer);
  const setup=[{x:62,y:25},{x:85,y:3},{x:85,y:47},{x:70,y:9},{x:84,y:18},
    {x:66,y:25},{x:85,y:7},{x:85,y:43},{x:73,y:12},{x:87,y:19}];
  for(const kind of ["handoff","off-ball-screen"] as const)for(const side of [0,1] as const) {
    const index=(i:number)=>(i+side*5)%10;
    const points=side?setup.slice(5).concat(setup.slice(0)).map(p=>({x:94-p.x,y:p.y})):setup;
    const roster=side?ps.slice(5).concat(ps.slice(0)):ps;
    const screener=index(kind==="handoff"?0:4),receiver=index(1),handler=index(0);
    const result=resolvePossession(roster,side,handler,points,points,{shooter:receiver,shot:points[receiver],three:true,
      action:"catch-and-shoot",chance:.4,value:1.2,movement:{kind,receiver,screener,direction:1}},23.8);
    const use=result.frames.findIndex(f=>f.phase===(kind==="handoff"?"Dribble handoff":"Off-ball screen · Curl"));
    const finish=result.frames.findIndex(f=>f.phase===(kind==="handoff"?"Handoff · Turn the corner":"Curl · Catch"));
    assert.ok(use>6 && finish>use,`${kind} must set, use, and finish the action`);
    const planted=result.frames[use].spots[screener],earlier=result.frames[use-5].spots[screener];
    assert.ok(Math.hypot(planted.x-earlier.x,planted.y-earlier.y)<.3);
    assert.equal(result.shooter,receiver);
    const passFrame=result.frames[Math.floor(result.passAt/.55*(result.frames.length-1))];
    if(kind==="handoff")assert.ok(Math.hypot(passFrame.spots[receiver].x-passFrame.spots[handler].x,passFrame.spots[receiver].y-passFrame.spots[handler].y)<5.5,"A handoff cannot be a long-distance pass");
    else assert.ok(result.passAt/.55*(result.frames.length-1)>=use,"Pass follows the screen");
    const after=result.frames.at(-1)!.spots[receiver];
    assert.ok(Math.hypot(after.x-passFrame.spots[receiver].x,after.y-passFrame.spots[receiver].y)>2,"Receiver continues moving after the exchange");
  }
});

test("possession clock resets on control, pauses on dead balls, and legal shots beat the buzzer",()=>{
  const seen=new Set<string>();
  for(let seed=0;seed<100;seed++) {
    const game=simulate(teams,seed===41?300:120,seed);
    assert.equal(shotClock(game,0),24);
    for(const inbound of game.inbounds)assert.equal(shotClock(game,(inbound.start+inbound.end)/2),24);
    for(const play of game.plays) {
      assert.ok(Math.abs(shotClock(game,play.start)!-play.shotClockStart)<.00001);
      if(play.outcome==="foul") {
        seen.add("foul");assert.equal(shotClock(game,replayTime(play,.56)),shotClock(game,replayTime(play,.9)));
      }
      if(play.rebounder!==null) {
        const offensive=Math.floor(play.rebounder/5)===play.side;
        seen.add(offensive?"offensive rebound":"defensive rebound");
        assert.ok(Math.abs(shotClock(game,replayTime(play,.98)+.000001)!-(offensive?14:24))<.00001);
      }
      if(["made","missed","blocked"].includes(play.outcome)) {
        const release=replayTime(play,shotRelease(play));
        assert.ok(release-play.start<=play.shotClockStart+.00001);
        assert.ok(gameElapsed(game,release)<=game.duration);
        assert.equal(shotClock(game,release+.00001),null);
        const flight=replayTime(play,.88)-release;
        assert.ok(flight>=.64999 && flight<=1.25001,`Shot floated for ${flight}s`);
      }
      if(play.outcome==="violation") {
        seen.add("violation");
        const whistle=replayTime(play,.55)+.001;
        assert.equal(shotClock(game,whistle),0);
        assert.equal(courtFrame(game,whistle).event?.title,"SHOT CLOCK");
        assert.equal(gameElapsed(game,whistle),play.gameEnd);
        // A clock violation is a team turnover, never a fabricated steal or individual attempt.
        const before=simulationState(game,play.start).lines;
        assert.deepEqual(play.lines,before);
      }
    }
    assert.equal(shotClock(game,game.playbackDuration),null);
  }
  assert.deepEqual([...seen].sort(),["defensive rebound","foul","offensive rebound","violation"]);
});

test("fast breaks exploit an open runner, outlet from the rebounder, and settle against recovered defense",()=>{
  const ps=players.map(simulationPlayer);
  const open=[{x:50,y:18},{x:65,y:35},{x:20,y:7},{x:20,y:30},{x:25,y:44},
    {x:50,y:25},{x:35,y:8},{x:30,y:42},{x:10,y:15},{x:10,y:36}];
  const rebound=[{x:8,y:25},{x:25,y:8},{x:18,y:40},{x:10,y:6},{x:12,y:45},
    {x:40,y:25},{x:50,y:8},{x:50,y:42},{x:60,y:15},{x:60,y:36}];
  const recovered=[{x:62,y:25},{x:58,y:8},{x:55,y:42},{x:45,y:15},{x:45,y:36},
    {x:67,y:25},{x:80,y:8},{x:80,y:42},{x:86,y:18},{x:86,y:33}];
  const attack=resolveFastBreak(ps,0,0,open,22,"steal");
  assert.equal(attack.fastBreak.result,"rim");
  assert.equal(attack.shooter,1);assert.equal(attack.passer,0);
  assert.ok(attack.seconds<4,"The open runner should finish before half-court setup");
  assert.ok(attack.frames.some(f=>f.phase==="Fast break · Hit ahead"));
  const mirror=resolveFastBreak([...ps.slice(5),...ps.slice(0,5)],1,5,
    [...open.slice(5),...open.slice(0,5)].map(p=>({x:94-p.x,y:p.y})),22,"steal");
  assert.equal(mirror.fastBreak.result,"rim");assert.equal(mirror.shooter,6);
  assert.ok(Math.abs(mirror.seconds-attack.seconds)<.04);
  const outlet=resolveFastBreak(ps,0,0,rebound,22,"rebound");
  assert.deepEqual(outlet.frames[0].ball,rebound[0]);
  assert.ok(outlet.frames.some(f=>f.phase==="Fast break · Outlet"));
  assert.ok(outlet.frames.some(f=>f.carrier!==0));
  // A defender already back can take away the same early finish.
  const covered=open.map(p=>({...p}));covered[5]={x:72,y:25};
  assert.equal(resolveFastBreak(ps,0,0,covered,22,"steal").fastBreak.result,"settled");
  const settled=resolveFastBreak(ps,0,0,recovered,22,"steal");
  assert.equal(settled.fastBreak.result,"settled");
  assert.ok(settled.frames.some(f=>f.phase==="Fast break covered · Flow into offense"));
  for(const result of [attack,mirror,outlet,settled]) {
    assert.deepEqual(result.frames.at(-1)!.ball,result.to[result.shooter]);
    for(let n=1;n<result.frames.length;n++) {
      const a=result.frames[n-1],b=result.frames[n],dt=b.at!-a.at!;
      assert.ok(dt>0);
      assert.ok(Math.hypot(a.ball!.x-b.ball!.x,a.ball!.y-b.ball!.y)<80*dt+.1,"Outlet or fallback teleported the ball");
      for(let i=0;i<10;i++)assert.ok(Math.hypot(a.spots[i].x-b.spots[i].x,a.spots[i].y-b.spots[i].y)<18*dt+.05);
    }
  }
});

test("only live steals and defensive field-goal rebounds trigger fast breaks with real ball ownership",()=>{
  const seen=new Set<string>();
  for(let seed=0;seed<25;seed++) {
    const game=simulate(teams,300,seed);
    game.plays.forEach((play,n)=>{
      const previous=game.plays[n-1];
      if(!previous) {assert.equal(play.fastBreak,undefined);return;}
      const expected=previous.stolen?"steal":previous.rebounder!==null && previous.side!==play.side && previous.outcome!=="foul"?"rebound":null;
      if(!expected) {
        assert.equal(play.fastBreak,undefined);
        if(previous.outcome==="turnover" && !previous.stolen) {
          seen.add("dead turnover");assert.ok(game.inbounds.some(i=>i.start===previous.end && i.end===play.start));
        }
        return;
      }
      seen.add(expected);seen.add(play.fastBreak!.result);
      assert.equal(play.fastBreak?.trigger,expected);
      assert.equal(play.handler,expected==="steal"?previous.defender:previous.rebounder);
      assert.deepEqual(play.frames[0].ball,play.from[play.handler]);
      assert.ok(!game.inbounds.some(i=>i.start===previous.end && i.end===play.start));
      for(const frame of play.frames.filter((_,i)=>i%15===0)) {
        const rendered=courtFrame(game,play.start+frame.at!);
        assert.ok(Math.hypot(rendered.ball.x-frame.ball!.x,rendered.ball.y-frame.ball!.y)<.001);
      }
      const before=courtFrame(game,play.start-.000001),after=courtFrame(game,play.start);
      assert.ok(Math.hypot(before.ball.x-after.ball.x,before.ball.y-after.ball.y)<.01);
      if(play.fastBreak!.result!=="settled") {
        assert.equal(play.screen,undefined);assert.equal(play.movement,undefined);
        assert.ok(play.approachSeconds<=7.8);
      }
    });
  }
  for(const kind of ["steal","rebound","rim","settled","dead turnover"])assert.ok(seen.has(kind),kind);
});


test("transition defense contains the ball, preserves rim cover and reacts to passes and penetration",()=>{
  const ps=players.map(simulationPlayer);
  const spots=[{x:65,y:18},{x:74,y:40},{x:44,y:7},{x:40,y:30},{x:25,y:44},
    {x:71,y:20},{x:84,y:25},{x:64,y:42},{x:40,y:15},{x:40,y:36}];
  const plan=transitionDefense(ps,0,0,spots,{x:10,y:2});
  assert.equal(plan.roles.stopper,5);assert.equal(plan.roles.rim,6);
  assert.ok(plan.goals[5].x>spots[0].x && plan.goals[5].x<75);
  assert.ok(plan.goals[6].x>=83);assert.equal(plan.helping,false);
  const drive=spots.map(p=>({...p}));drive[0]={x:79,y:18};drive[5]={x:73,y:20};
  const help=transitionDefense(ps,0,0,drive,{x:10,y:0},plan.roles);
  assert.deepEqual(help.roles,plan.roles);assert.equal(help.helping,true);
  assert.ok(help.goals[6].y<23,"Rim help must step toward the driver");
  const pass=transitionDefense(ps,0,1,spots,{x:10,y:0},plan.roles);
  assert.equal(pass.roles.carrier,1);assert.notEqual(pass.roles.stopper,pass.roles.rim);
  const mirror=transitionDefense([...ps.slice(5),...ps.slice(0,5)],1,5,
    [...spots.slice(5),...spots.slice(0,5)].map(p=>({x:94-p.x,y:p.y})),{x:-10,y:2});
  assert.equal(mirror.roles.stopper,(plan.roles.stopper+5)%10);
  plan.goals.forEach((p,i)=>assert.ok(Math.hypot(94-p.x-mirror.goals[(i+5)%10].x,p.y-mirror.goals[(i+5)%10].y)<.001));
});

test("blocks require a reachable contest and can credit the rim helper",()=>{
  const ps=players.map(simulationPlayer).map(p=>({...p,block:0}));
  ps[5].block=.2;ps[6].block=4;ps[7].block=10;
  const spots=Array.from({length:10},()=>({x:20,y:5}));
  const shot={x:84,y:25};spots[5]={x:81,y:25};spots[6]={x:88,y:25};
  const options=blockCandidates(ps,spots,shot,0,false);
  assert.deepEqual(options.map(c=>c.i),[5,6]);
  assert.ok(options[1].chance>options[0].chance,"Nearby rim protector should have a stronger contest than the guard");
  assert.equal(blockCandidates(ps,spots,{x:60,y:25},0,true).length,0);
  let checked=0;
  for(let seed=0;seed<30;seed++) {
    const game=simulate(teams,300,seed);
    for(const play of game.plays.filter(p=>p.outcome==="blocked")) {
      assert.ok(blockCandidates(game.players,play.to,play.shot,play.side,play.three).some(c=>c.i===play.defender));
      const before=simulationState(game,replayTime(play,.879)).lines[play.defender].blk;
      assert.equal(simulationState(game,replayTime(play,.881)).lines[play.defender].blk,before+1);
      assert.equal(courtFrame(game,replayTime(play,.89)).event?.title,"BLOCK");
      const contact=courtFrame(game,replayTime(play,.88)).ball;
      assert.ok(Math.hypot(contact.x-play.to[play.defender].x,contact.y-play.to[play.defender].y)<2.3);
      const a=courtFrame(game,replayTime(play,.88)-.00001).ball,b=courtFrame(game,replayTime(play,.88)+.00001).ball;
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.01,"Block must deflect without teleporting to the hoop");
      checked++;
    }
  }
  assert.ok(checked>0);
});
