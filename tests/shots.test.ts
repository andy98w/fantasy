import test from "node:test";
import assert from "node:assert/strict";
import { elapsedTime, normalizeShots, shootingTotals, shotZone } from "../lib/shots";
import type { BoxTeam } from "../lib/game-boxscore";
const teams:BoxTeam[]=[{id:"13",totals:{},players:[{id:1,name:"Shooter",starter:true,didNotPlay:false,reason:"",stats:{"fieldGoalsMade-fieldGoalsAttempted":"1-3"}}]}];
const play = {id:"s1",shootingPlay:true,pointsAttempted:3,scoringPlay:true,text:"Shooter makes a three",team:{id:"13"},participants:[{athlete:{id:"1"}},{athlete:{id:"2"}}],period:{number:1},clock:{displayValue:"11:00"},coordinate:{x:1,y:2}};

test("shot normalization identifies the shooter, excludes free throws, and retains only the latest duplicate",()=>{
  const report=normalizeShots({plays:[play,{...play,pointsAttempted:1,id:"ft"},{...play,scoringPlay:false}]},"401909952",teams);
  assert.equal(report.shots.length,1);assert.equal(report.shots[0].playerId,1);assert.equal(report.shots[0].made,false);
  assert.equal(report.shots[0].elapsed,60);assert.deepEqual(report.expected,{"1":3});assert.equal(report.available,true);
});
test("bad locations remain attempts without fake coordinates; invalid identities and clocks are skipped",()=>{
  const report=normalizeShots({plays:[{...play,coordinate:{x:-214748340,y:-214748365}}, {...play,id:"wrongteam",team:{id:"1"}}, {...play,id:"badtime",clock:{displayValue:"13:00"}}]},"401909952",teams);
  assert.equal(report.shots.length,1);assert.equal(report.shots[0].x,null);assert.equal(report.shots[0].y,null);assert.equal(report.skipped,2);
  assert.equal(shotZone(report.shots[0]),"Unlocated");assert.equal(shootingTotals(report.shots).attempted,1);
  assert.equal(normalizeShots({},"401909952",teams).available,false);
});
test("quarter boundaries, fractional clocks and overtime have consistent elapsed time",()=>{
  assert.equal(elapsedTime(1,"12:00"),0);assert.equal(elapsedTime(2,"12:00"),720);
  assert.equal(elapsedTime(4,"0.5"),2879.5);assert.equal(elapsedTime(5,"5:00"),2880);
  assert.equal(elapsedTime(6,"0:00"),3480);assert.equal(elapsedTime(5,"12:00"),null);
  assert.equal(elapsedTime(1,"1:60"),null);
  const report=normalizeShots({plays:[{...play,period:{number:5},clock:{displayValue:"1:00"}}]},"401909952",teams);
  assert.equal(report.duration,3180);assert.equal(report.shots[0].elapsed,3120);
});
test("shooting percentages and zones use attempts and do not mislabel a long two as a three",()=>{
  const shots=normalizeShots({plays:[play,{...play,id:"miss",scoringPlay:false,pointsAttempted:2,coordinate:{x:25,y:1}},{...play,id:"two",pointsAttempted:2,coordinate:{x:2,y:2}}]},"401909952",teams).shots;
  const stats=shootingTotals(shots);assert.equal(stats.made,2);assert.equal(stats.attempted,3);assert.equal(stats.made3,1);assert.equal(stats.efg,2.5/3);
  assert.equal(shotZone(shots.find(s=>s.id==="s1")!),"Corner 3");assert.equal(shotZone(shots.find(s=>s.id==="miss")!),"At rim");assert.equal(shotZone(shots.find(s=>s.id==="two")!),"Other 2PT");
  assert.equal(shootingTotals([]).fg,null);
});

test("explicit missed heaves are charted but excluded only when official player attempts reconcile",()=>{
  const heave={...play,id:"heave",type:{text:"Heave Jump Shot"},scoringPlay:false,clock:{displayValue:"1.7"},coordinate:{x:27,y:49}};
  const normal=[play,{...play,id:"s2"},{...play,id:"s3"}];
  const report=normalizeShots({plays:[...normal,heave]},"401909952",teams);
  assert.equal(report.shots.length,4);assert.equal(report.shots.find(s=>s.id==="heave")?.teamAttempt,true);
  assert.equal(shootingTotals(report.shots).attempted,3);
  const unresolved=normalizeShots({plays:[play,heave]},"401909952",teams);
  assert.equal(unresolved.shots.some(s=>s.teamAttempt),false);
  const fourthQuarter=normalizeShots({plays:[...normal,{...heave,period:{number:4}}]},"401909952",teams);
  assert.equal(fourthQuarter.shots.some(s=>s.teamAttempt),false);
});
