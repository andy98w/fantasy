import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
import { canSimulate, courtFrame, simulate, simulationState, simulationPlayer, shotQuality } from "../lib/simulation";
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
  const final = simulationState(game, game.duration);
  assert.equal(final.completed.length, game.plays.length);
  assert.deepEqual(simulationState(game, 0).score, [0, 0]);
});

test("exhibition score, shot accounting and rebounds stay consistent across different seeds", () => {
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const game = simulate(teams, 300, seed);
    assert.equal(game.plays.at(-1)?.end, 300);
    const final = simulationState(game, 300);
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
    for (let t = 0; t <= game.duration; t += 3) {
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
  for (let seed=0;seed<20;seed++) {
    const game = simulate(nonShooters,300,seed);
    assert.ok(game.plays.every(p=>!p.three));
    for (const play of game.plays) {
      assert.ok(play.shotChance >= .12 && play.shotChance <= .82);
      assert.equal(Math.floor(play.handler/5),play.side);
      assert.equal(Math.floor(play.shooter/5),play.side);
      assert.notEqual(Math.floor(play.defender/5),play.side);
      if (play.passer !== null) assert.notEqual(play.passer,play.shooter);
    }
  }
});
