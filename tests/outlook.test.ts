import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { playerOutlook, buildOutlook, outlookRoster } from '../lib/outlook';
import { snapshotSchema, type Player } from '../lib/schema';
import { TradeCalculator } from '../components/league/trade-calculator';
import { OutlookDetails } from '../components/league/outlook-details';
import demo from '../lib/demo.json';
const base=snapshotSchema.parse(demo);
const stats={PTS:21,REB:6,AST:4,STL:1,BLK:1,'3PM':2,TO:2,FGM:8,FGA:16,FTM:3,FTA:4,MIN:30};
const player=(changes:Partial<Player>={}):Player=>({...base.players[0],gamesPlayed:5,stats:{...stats},previousSeason:{season:2026,gamesPlayed:60,stats:{...stats,FTM:3.6,PTS:21.6}},...changes});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('outlook smooths the first game, increases current influence and caps thin history',()=>{
  const p=player({gamesPlayed:1,stats:{...stats,STL:5}}), original=JSON.stringify(p);
  const early=playerOutlook(p,2027),later=playerOutlook({...p,gamesPlayed:25},2027);
  assert.equal(early.source,'blended'); assert.ok(early.stats!.STL!>1 && early.stats!.STL!<5);
  assert.ok(later.stats!.STL!>early.stats!.STL!);
  const thin=playerOutlook({...p,previousSeason:{...p.previousSeason!,gamesPlayed:2}},2027);
  near(thin.currentWeights.STL,1/3); assert.match(thin.warnings.join(),/Limited previous/);
  assert.equal(JSON.stringify(p),original);
});
test('shooting regresses by attempts and stays coherent with makes and points',()=>{
  const p=player(),o=playerOutlook(p,2027),w=20/(20+240);
  near(o.currentWeights['FT%'],w);
  near(o.stats!['FT%']!, (15+216)/260);
  near(o.stats!.FTM!,o.stats!['FT%']!*o.stats!.FTA!);
  near(o.stats!.PTS!,2*o.stats!.FGM!+o.stats!['3PM']!+o.stats!.FTM!);
  assert.ok(o.stats!['3PM']!<=o.stats!.FGM!);
  const more=playerOutlook({...p,stats:{...stats,FTA:8,FTM:6}},2027);
  assert.ok(more.currentWeights['FT%']>o.currentWeights['FT%']);
});
test('current minutes adapt immediately while old per-minute rates shrink noisy counts',()=>{
  const p=player({stats:{...stats,MIN:15,REB:3}}),o=playerOutlook(p,2027);
  assert.equal(o.stats!.MIN,15);assert.equal(o.stats!.REB,3);
  assert.match(o.warnings.join(),/role needs review/);
  const noMinutes=playerOutlook({...p,stats:{...p.stats,MIN:null}},2027);
  assert.match(noMinutes.warnings.join(),/per-game blending/);assert.equal(noMinutes.stats!.MIN,undefined);
});
test('missing, stale and invalid baselines stay explicit instead of fabricating stats',()=>{
  const p=player();
  for(const prior of [undefined,{...p.previousSeason!,season:2025},{...p.previousSeason!,stats:{PTS:20}}]) {
    const o=playerOutlook({...p,previousSeason:prior},2027);
    assert.equal(o.source,'current_only');assert.equal(o.stats!.PTS,stats.PTS);
    assert.equal(playerOutlook({...p,previousSeason:prior,gamesPlayed:0},2027).source,'unavailable');
  }
  assert.equal(playerOutlook({...p,stats:{...stats,REB:null}},2027).stats,null);
  const zero=playerOutlook({...p,gamesPlayed:0,stats:{}},2027);
  assert.equal(zero.source,'previous_only');assert.equal(zero.stats!.FTM,3.6);
  assert.equal(playerOutlook({...p,stats:{...stats,FGM:17}},2027).source,'unavailable');
});
test('zero shooting attempts do not become made-up percentages or non-finite values',()=>{
  const p=player({stats:{...stats,FTM:0,FTA:0},previousSeason:{season:2026,gamesPlayed:60,stats:{...stats,FTM:0,FTA:0}}});
  const o=playerOutlook(p,2027);assert.equal(o.stats!['FT%'],null);assert.equal(o.stats!.FTM,0);
  assert.ok(Object.values(o.stats!).every(v=>v===null||Number.isFinite(v)));
});
test('one fixed outlook pool survives trades and ownership changes without replacing actual Power',()=>{
  const data=structuredClone(base); data.players[0]=player();
  const before=JSON.stringify(data),context=buildOutlook(data),p=data.players[0];
  const moved={...p,teamId:999,slot:'IR'};
  const roster=outlookRoster([moved],context);
  assert.equal(roster[0].teamId,999);assert.equal(roster[0].slot,'IR');
  assert.deepEqual(roster[0].contributions,context.players.find(r=>r.id===p.id)!.contributions);
  assert.equal(roster[0].power,null);assert.equal(JSON.stringify(data),before);
  const reordered=buildOutlook({...data,players:[...data.players].reverse()});
  for(const row of context.players)near(row.zTotal??0,reordered.players.find(p=>p.id===row.id)!.zTotal??0);
});
test('trade UI defaults to balanced outlook and inputs keep current and prior separate',()=>{
  const html=renderToStaticMarkup(createElement(TradeCalculator,{data:base}));
  assert.match(html,/Balanced outlook/);assert.match(html,/Trade valuation basis/);
  const p=player(),detail=renderToStaticMarkup(createElement(OutlookDetails,{player:p,estimate:playerOutlook(p,2027)}));
  for(const label of ['Current','Previous','Outlook','Current weight','60 games'])assert.ok(detail.includes(label));
  assert.doesNotMatch(detail,/<details[^>]*open/);
});
