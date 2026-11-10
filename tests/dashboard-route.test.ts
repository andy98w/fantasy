import test from "node:test";
import assert from "node:assert/strict";
import { dashboardHash, dashboardRoute } from "../lib/dashboard-route";
import { snapshotSchema } from "../lib/schema";
import demo from "../lib/demo.json";
const data = snapshotSchema.parse(demo);

test("matchup URLs restore the selected game after refresh or opening a shared link", () => {
  const game = data.matchups[1];
  const hash = dashboardHash("matchup", { matchupId: game.id, period: game.period });
  assert.deepEqual(dashboardRoute(hash, data), {view:"matchup",teamId:null,matchupId:game.id});
  assert.equal(dashboardRoute("#matchup", data)?.matchupId, data.matchups[0].id);
});

test("team selection and plain tabs restore independently of previous state", () => {
  assert.deepEqual(dashboardRoute(dashboardHash("team", {teamId:data.teams[1].id}), data), {view:"team",teamId:data.teams[1].id});
  assert.deepEqual(dashboardRoute("#team", data), {view:"team",teamId:null});
  for (const view of ["league","players","analysis","trades","forecast","records","mcp","connection"] as const)
    assert.equal(dashboardRoute(dashboardHash(view),data)?.view,view);
  assert.equal(dashboardRoute("#rankings",data)?.view,"players");
  assert.equal(dashboardRoute("",data)?.view,"league");
  assert.equal(dashboardRoute("#main-content",data),null);
});

test("stale or invalid matchup links cannot silently show the first matchup", () => {
  for (const hash of ["#matchup?id=nope", "#matchup?id=-1", "#matchup?id=999999999999999999999", `#matchup?id=${data.matchups[0].id}&week=999`])
    assert.equal(dashboardRoute(hash,data)?.view,"league");
  assert.equal(dashboardRoute("#matchup",{...data,matchups:[]})?.view,"league");
  assert.equal(dashboardRoute("#team?id=99999",data)?.teamId,null);
});
