/** npx tsx scripts/backtest-outlook.ts raw-history.json report.json
 * Input: [{id,name,seasons:{2025: ESPN game-log payload,2026: payload}}].
 * Fetching is separate so this evaluation is reproducible from a frozen input.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizePlayerGames } from '../lib/player-games';
import { playerOutlook, OUTLOOK_MODEL, type OutlookConfig } from '../lib/outlook';
import { type Player } from '../lib/schema';
const raw = readFileSync(process.argv[2], 'utf8');
const input = JSON.parse(raw) as {id:number;name:string;seasons:Record<string,any>}[];
const keys = ['PTS','REB','AST','STL','BLK','3PM','TO','FG%','FT%','MIN'];
function games(payload:any, season:number) {
  if (!payload?.seasonTypes) return [];
  const seasonTypes=payload.seasonTypes.filter((s:any)=>/regular/i.test(s.displayName));
  const ids=new Set(seasonTypes.flatMap((s:any)=>s.categories.filter((c:any)=>c.type==='event').flatMap((c:any)=>(c.events??[]).map((e:any)=>e.eventId))));
  return normalizePlayerGames({...payload,seasonTypes,events:Object.fromEntries(Object.entries(payload.events).filter(([id])=>ids.has(id)))},String(season),'2026-11-03T00:00:00Z').games.reverse().map(g=>{
    const s=g.stats, pair=(key:string)=>s[key].split('-').map(Number);
    const [FGM,FGA]=pair('fieldGoalsMade-fieldGoalsAttempted'),[FTM,FTA]=pair('freeThrowsMade-freeThrowsAttempted'),[threes]=pair('threePointFieldGoalsMade-threePointFieldGoalsAttempted');
    return {PTS:+s.points,REB:+s.rebounds,AST:+s.assists,STL:+s.steals,BLK:+s.blocks,'3PM':threes,TO:+s.turnovers,MIN:+s.minutes,FGM,FGA,FTM,FTA};
  }).filter(s=>Object.values(s).every(Number.isFinite) && s.MIN>0);
}
function average(rows:Record<string,number>[]) {
  const stats:Record<string,number>={}; for(const row of rows)for(const [key,value] of Object.entries(row))stats[key]=(stats[key]??0)+value/rows.length;
  stats['FG%']=stats.FGA?stats.FGM/stats.FGA:NaN;stats['FT%']=stats.FTA?stats.FTM/stats.FTA:NaN;return stats;
}
const samples=input.sort((a,b)=>a.id-b.id).flatMap((p,i)=>{
  const prior=games(p.seasons[2025],2025),current=games(p.seasons[2026],2026);
  if(prior.length<20 || current.length<35)return [];
  return [1,3,5,10,15,25].map(n=>({split:i%3===0?'holdout':'train',id:p.id,n,
    player:{id:p.id,name:p.name,gamesPlayed:n,stats:average(current.slice(0,n)),previousSeason:{season:2025,gamesPlayed:prior.length,stats:average(prior)}} as Player,
    target:average(current.slice(n,n+10))}));
});
const train=samples.filter(s=>s.split==='train'),holdout=samples.filter(s=>s.split==='holdout');
if(train.length<60 || holdout.length<30)throw Error('Insufficient train/holdout examples');
const scales=Object.fromEntries(keys.map(k=>{const values=train.map(s=>s.target[k]).filter(Number.isFinite),mean=values.reduce((a,b)=>a+b)/values.length;return[k,Math.max(1e-6,values.reduce((a,b)=>a+(b-mean)**2,0)/values.length)];}));
function evaluate(rows:typeof samples, config:OutlookConfig|'current'|'previous') {
  const errors=Object.fromEntries(keys.map(k=>[k,{absolute:0,squared:0,weight:0}]));
  for(const s of rows){const estimate=config==='current'?s.player.stats:config==='previous'?s.player.previousSeason!.stats:playerOutlook(s.player,2026,config).stats!;
    for(const k of keys){const value=estimate[k],truth=s.target[k];if(value==null||!Number.isFinite(value)||!Number.isFinite(truth))continue;
      const weight=k==='FG%'?s.target.FGA:k==='FT%'?s.target.FTA:1;const e=errors[k];e.absolute+=Math.abs(value-truth)*weight;e.squared+=(value-truth)**2*weight;e.weight+=weight;}}
  const metrics=Object.fromEntries(keys.map(k=>[k,{mae:errors[k].absolute/errors[k].weight,mse:errors[k].squared/errors[k].weight}]));
  return {normalizedMse:keys.filter(k=>k!=='MIN').reduce((sum,k)=>sum+metrics[k].mse/scales[k],0)/9,metrics};
}
// Fixed candidate grid; select only on training players, never held-out players.
const grids={priorGames:[5,10,20,30,40],stocksPriorGames:[10,20,30,40,60],minutesPriorGames:[0,3,5,8,12],fgPriorAttempts:[50,100,150,250,400],ftPriorAttempts:[25,50,100,150,250]};
let chosen:OutlookConfig={priorGames:20,stocksPriorGames:30,minutesPriorGames:8,fgPriorAttempts:150,ftPriorAttempts:100};
for(let pass=0;pass<2;pass++)for(const key of Object.keys(grids) as (keyof OutlookConfig)[]){
  chosen=grids[key].map(value=>({...chosen,[key]:value})).sort((a,b)=>evaluate(train,a).normalizedMse-evaluate(train,b).normalizedMse)[0];
}
const report={inputSha256:createHash('sha256').update(raw).digest('hex'),source:'ESPN NBA regular-season individual game logs',priorSeason:2025,targetSeason:2026,checkpoints:[1,3,5,10,15,25],targetGames:10,
  samplePlayerIds:input.map(p=>p.id),evaluatedPlayerIds:[...new Set(samples.map(s=>s.id))],
  sampling:'48 currently rostered veterans with >=40 previous-season GP, sorted ESPN ID, every third. Evaluation requires >=20 prior games and >=35 target games. Survivor/roster selection bias; not representative of rookies or long-term injuries.',
  split:'Sorted sampled player index modulo 3: 0 holdout, otherwise training. All checkpoints for one player stay in one split.',
  trainPlayers:new Set(train.map(s=>s.id)).size,holdoutPlayers:new Set(holdout.map(s=>s.id)).size,trainExamples:train.length,holdoutExamples:holdout.length,
  selection:'Two coordinate passes over fixed grid, training normalized MSE equally weighted across 9 categories; shooting errors weighted by target attempts. Scales estimated from training targets only.',grids,chosen,
  training:{current:evaluate(train,'current'),previous:evaluate(train,'previous'),balanced:evaluate(train,chosen)},
  holdout:{current:evaluate(holdout,'current'),previous:evaluate(holdout,'previous'),balanced:evaluate(holdout,chosen)},
  byCheckpoint:Object.fromEntries([1,3,5,10,15,25].map(n=>[n,{current:evaluate(holdout.filter(s=>s.n===n),'current'),balanced:evaluate(holdout.filter(s=>s.n===n),chosen)}])),
  deployed:evaluate(holdout,OUTLOOK_MODEL),
  limits:'Small selected veteran sample, one season, overlapping next-10-game windows. Measures per-game stats while playing, not availability, ROS totals, trade acceptance, category-win probability, or future role changes.'};
writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({chosen,trainPlayers:report.trainPlayers,holdoutPlayers:report.holdoutPlayers,holdout: Object.fromEntries(Object.entries(report.holdout).map(([k,v])=>[k,v.normalizedMse]))},null,2));
