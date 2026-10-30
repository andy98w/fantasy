import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { snapshotSchema, transactionSchema } from "../lib/schema";
import { filterTransactions } from "../lib/ledger";
import { TransactionLedger } from "../components/league/transaction-ledger";
import { Records } from "../components/league/records";
import { Forecast } from "../components/league/forecast";
import demo from "../lib/demo.json";

const trade = transactionSchema.parse({id:'trade',completedAt:'2026-10-29T23:00:00Z',moves:[
  {type:'TRADE',playerId:1,fromTeamId:1,toTeamId:2,via:null},
  {type:'TRADE',playerId:2,fromTeamId:2,toTeamId:1,via:null},
]});
const addDrop = transactionSchema.parse({id:'pickup',completedAt:'2026-10-30T01:00:00Z',moves:[
  {type:'ADD',playerId:3,fromTeamId:null,toTeamId:3,via:'WAIVERS'},
  {type:'DROP',playerId:4,fromTeamId:3,toTeamId:null,via:null},
]});

test('ledger filters either side of trades, keeps grouped moves, and sorts newest first', () => {
  const data = snapshotSchema.parse(demo);
  const players = [{...data.players[0],id:1,name:'Trade Player'},{...data.players[0],id:3,name:'Waiver Player'}];
  const events = [trade,addDrop];
  assert.deepEqual(filterTransactions(events,players,'all','all','').map(e=>e.id),['pickup','trade']);
  assert.deepEqual(filterTransactions(events,players,'2','TRADE','Trade Player'),[trade]);
  assert.deepEqual(filterTransactions(events,players,'3','ADD','waiver'),[addDrop]);
  assert.deepEqual(filterTransactions(events,players,'3','DROP','waiver'),[]);
  assert.deepEqual(filterTransactions(events,players,'1','ADD',''),[]);
});

test('ledger supports existing snapshots and shows waiver source, directions, and no fabricated history', () => {
  const data = snapshotSchema.parse(demo);
  assert.deepEqual(data.transactions,[]);
  assert.match(renderToStaticMarkup(createElement(TransactionLedger,{data})),/next import/);
  data.transactions=[trade,addDrop];data.activitySyncedAt='2026-10-30T01:05:00Z';
  const html=renderToStaticMarkup(createElement(TransactionLedger,{data}));
  assert.match(html,/Waiver add/);assert.match(html,/Dropped/);assert.match(html,/Waivers/);assert.match(html,/Player pool/);
  assert.ok(html.indexOf('Add / drop') < html.indexOf('<h2>Trade</h2>'));
  assert.equal(transactionSchema.safeParse({...trade,moves:[{...trade.moves[0],toTeamId:1}]}).success,false);
  assert.equal(transactionSchema.safeParse({...addDrop,moves:[{...addDrop.moves[0],toTeamId:null}]}).success,false);
});

test('Records includes Ledger and Forecast owns What if', () => {
  const data = snapshotSchema.parse(demo);
  const records=renderToStaticMarkup(createElement(Records,{data}));
  assert.match(records,/>Ledger</);assert.doesNotMatch(records,/>What if</);
  const forecast=renderToStaticMarkup(createElement(Forecast,{data}));
  assert.match(forecast,/>What if</);assert.match(forecast,/>Next week</);
});
