import test from "node:test";
import assert from "node:assert/strict";
import { createInjuryLoader, normalizeInjuries } from "../lib/player-injury";
import { GET } from "../app/api/players/[id]/injury/route";
const at = "2026-11-02T22:00:00Z";
const row = { id: "999", status: "Out", date: "2026-10-26T22:01Z", shortComment: "Will be re-evaluated in 10-to-14 days.", longComment: "No confirmed return date.",
  athlete: { links: [{href:"https://www.espn.com/nba/player/_/id/4594327/keegan-murray"}], notes:{items:[{source:"RotoWire"}]} },
  details:{type:"Ankle",returnDate:"2026-11-10"} };
const fixture = {status:"success",season:{year:2027},injuries:[{injuries:[row]}]};
test("injury identity uses athlete link, with source, estimate and separate reevaluation context", () => {
  const data = normalizeInjuries(fixture);
  assert.equal(data.reports.has(999),false);
  const r=data.reports.get(4594327)!;
  assert.equal(r.estimatedReturn,"2026-11-10");
  assert.equal(r.reevaluation,true);
  assert.equal(r.source,"RotoWire");
  assert.equal(r.reportedAt,"2026-10-26T22:01:00.000Z");
  assert.equal(r.report,"No confirmed return date.");
});
test("missing or impossible dates stay unknown; foreign player links cannot assign a report", () => {
  for(const returnDate of [undefined,"TBD","2026-02-30"]) {
    const d=normalizeInjuries({...fixture,injuries:[{injuries:[{...row,details:{returnDate}}]}]});
    assert.equal(d.reports.get(4594327)!.estimatedReturn,null);
  }
  const d=normalizeInjuries({...fixture,injuries:[{injuries:[{...row,athlete:{links:[{href:"https://evil.test/nba/player/_/id/4594327/"}]}}]}]});
  assert.equal(d.reports.size,0);
  assert.throws(()=>normalizeInjuries({status:"success"}));
  assert.throws(()=>normalizeInjuries({...fixture,status:"error"}));
});
test("newest injury report wins and resolved players disappear from fresh feed", async () => {
  const older={...row,date:"2026-10-20T10:00Z",details:{returnDate:"2026-10-25"}};
  const d=normalizeInjuries({...fixture,injuries:[{injuries:[row,older,{...older,date:undefined}]}]});
  assert.equal(d.reports.get(4594327)!.estimatedReturn,"2026-11-10");
  let now=Date.parse(at),payload=fixture;
  const load=createInjuryLoader(async()=>Response.json(payload),()=>now);
  assert.ok((await load("4594327","2027")).report);
  now+=301_000; payload={...fixture,injuries:[]};
  assert.equal((await load("4594327","2027")).report,null);
});
test("shared injury cache coalesces players, labels saved data, expires and recovers", async () => {
  let now=Date.parse(at),calls=0,failed=false;
  const load=createInjuryLoader(async url=>{
    calls++; assert.equal(String(url),"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries");
    if(failed)throw new Error("Offline"); return Response.json(fixture);
  },()=>now);
  const [a,b]=await Promise.all([load("4594327","2027"),load("123","2027")]);
  assert.equal(calls,1);assert.ok(a.report);assert.equal(b.report,null);
  await assert.rejects(load("4594327","2026"));
  now+=301_000;failed=true;
  const stale=await load("4594327","2027");
  assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,a.fetchedAt);
  await load("123","2027");assert.equal(calls,2);
  now+=86_400_000;await assert.rejects(load("4594327","2027"));
  now+=21_000;failed=false;
  assert.equal((await load("4594327","2027")).stale,false);
  await assert.rejects(load("../1","2027"));
});
test("injury route rejects invalid player/season without fetching", async () => {
  const response=await GET(new Request("https://example.test/api/players/1/injury?season=bad"),{params:Promise.resolve({id:"1"})});
  assert.equal(response.status,400);
});
