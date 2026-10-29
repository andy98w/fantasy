import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {snapshotSchema, type Player} from "../lib/schema";
import {powerMovers} from "../lib/power-movers";
import {sortPlayers} from "../components/league/format";
import {PowerMovers, PowerChange} from "../components/league/power-movers";
import demo from "../lib/demo.json";
const data=snapshotSchema.parse(demo);
const p=(id:number,delta:number|null,status:Player['powerTrendStatus']='measured'):Player=>({...data.players[0],id,name:`Player ${id}`,power:50,powerChange7d:delta,powerTrendStatus:status});
test('movers pick three strongest increases and decreases, omit new/unknown/unchanged, and preserve the input',()=>{
 const players=[p(1,5),p(2,20),p(3,-3),p(4,-15),p(5,0),p(6,null,'new'),p(7,null,'unavailable'),p(8,9),p(9,7),p(10,-8),p(11,-1)];
 const before=players.map(p=>p.id);
 assert.deepEqual(powerMovers(players).risers.map(p=>p.id),[2,8,9]);
 assert.deepEqual(powerMovers(players).fallers.map(p=>p.id),[4,10,3]);
 assert.deepEqual(players.map(p=>p.id),before);
 assert.deepEqual(powerMovers(players.filter(p=>p.id===1)).risers.map(p=>p.id),[1]);
});
test('delta sort keeps zero and places new/unknown last in both directions',()=>{
 const players=[p(1,0),p(2,10),p(3,-10),p(4,null,'new')];
 assert.deepEqual(sortPlayers(players,{key:'powerChange7d',descending:true}).map(p=>p.id),[2,1,3,4]);
 assert.deepEqual(sortPlayers(players,{key:'powerChange7d',descending:false}).map(p=>p.id),[3,1,2,4]);
});
test('cards stay hidden without baseline and newly rated players display New',()=>{
 const render=(baselineAt:string|null)=>renderToStaticMarkup(createElement(PowerMovers,{players:[p(1,5)],teams:data.teams,baselineAt,onSelect:()=>{}}));
 assert.equal(render(null),'');
 assert.match(render('2026-10-22T23:00:00Z'),/Risers/);
 assert.match(renderToStaticMarkup(createElement(PowerChange,{player:p(2,null,'new')})),/>New</);
});
test('private daily rating history is stripped from browser data',()=>{
 const parsed=snapshotSchema.parse({...demo,powerHistory:[{ratings:{'1':50}}]});
 assert.equal('powerHistory' in parsed,false);
});
