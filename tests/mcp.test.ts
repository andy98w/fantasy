import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpRequest } from "../lib/mcp/http";
import type { FantasyMcpData } from "../lib/mcp/server";
import { snapshotSchema } from "../lib/schema";
import { teamRating } from "../lib/analysis";
import demo from "../lib/demo.json";

const fixture = () => snapshotSchema.parse(structuredClone(demo));
function dependencies(snapshot = fixture()): FantasyMcpData {
  return {
    loadLeague: async () => ({ snapshot, syncFailure: null }),
    loadToday: async () => ({ date: "2026-11-01", fetchedAt: null, status: "error", games: [] }),
    loadBoxscore: async () => { throw new Error("postgres://private-secret@database"); },
    loadPlayerGames: async () => ({ games: [], fetchedAt: "2026-11-01T19:00:00Z", stale: true }),
    ratings: async () => [], listings: async () => [], now: () => Date.parse("2026-11-01T19:00:00Z"),
  };
}
async function connect(deps: FantasyMcpData) {
  const client = new Client({ name: "fantasy-agent-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: async (url, init) => handleMcpRequest(new Request(url, init), deps),
  }));
  return client;
}
// Assertions deliberately inspect wire-format structured content returned to an agent.
async function call(client: Client, name: string, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.structuredContent as Record<string, any>;
}
test("official Streamable HTTP clients initialize, discover read-only tools and reconnect without sessions", async () => {
  let reads = 0;
  const deps = dependencies(), original = deps.loadLeague;
  deps.loadLeague = async () => { reads++; return original(); };
  const first = await connect(deps), second = await connect(deps);
  try {
    const tools = (await first.listTools()).tools;
    assert.equal(tools.length, 13);
    assert.equal(reads, 0, "Discovery does not fetch private data or require an ESPN import");
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    const [a, b] = await Promise.all([call(first, "fantasy_get_league"), call(second, "fantasy_get_league")]);
    assert.equal(a.metadata.mode, "demo");
    assert.equal(a.teams.length, b.teams.length);
    assert.equal(reads, 2, "Fresh server/snapshot for each HTTP request");
    assert.ok(!JSON.stringify(a).includes("logoUrl"));
    assert.ok(!JSON.stringify(a).includes("myTeamId"));
  } finally { await first.close(); await second.close(); }
});
test("player search filters, numeric sorting and pagination preserve nulls", async () => {
  const s = fixture();
  s.players[0].stats.BLK = null;
  const client = await connect(dependencies(s));
  try {
    const all = await call(client, "fantasy_search_players", { sortBy: "BLK", limit: 2 });
    const next = await call(client, "fantasy_search_players", { sortBy: "BLK", limit: 2, offset: all.nextOffset });
    assert.equal(all.items.length, 2);
    assert.ok(all.items[0].stats.BLK >= all.items[1].stats.BLK);
    assert.ok(!all.items.some((p: any) => next.items.some((q: any) => p.id === q.id)));
    const end = await call(client, "fantasy_search_players", { sortBy: "BLK", offset: all.total - 1 });
    assert.equal(end.items[0].stats.BLK, null);
    const available = await call(client, "fantasy_search_players", { availability: "available", limit: 100 });
    assert.ok(available.items.every((p: any) => p.teamId === null && ["FREEAGENT", "WAIVERS"].includes(p.availability)));
    const roster = await call(client, "fantasy_search_players", { teamId: s.teams[0].id, availability: "rostered" });
    assert.ok(roster.items.every((p: any) => p.teamId === s.teams[0].id));
    const player = await call(client, "fantasy_get_player", { playerId: s.players[0].id });
    assert.equal(player.player.stats.BLK, null);
  } finally { await client.close(); }
});
test("team power and trade simulations reuse dashboard rules, exclude IR and never mutate rosters", async () => {
  const s = fixture(), left = s.teams[0].id, right = s.teams[1].id;
  const leftPlayers = s.players.filter(p => p.teamId === left), rightPlayers = s.players.filter(p => p.teamId === right);
  leftPlayers[0].slot = "IR";
  const before = JSON.stringify(s);
  const client = await connect(dependencies(s));
  try {
    const team = await call(client, "fantasy_get_team", { teamId: left });
    assert.equal(team.power, teamRating(leftPlayers).score);
    assert.equal(team.contributingPlayers, leftPlayers.filter(p => p.slot !== "IR").length);
    const result = await call(client, "fantasy_analyze_trade", { leftTeamId: left, rightTeamId: right,
      leftPlayerIds: [leftPlayers[1].id], rightPlayerIds: [rightPlayers[1].id], punts: ["TO"] });
    assert.equal(result.simulated, true);
    assert.equal(result.weights.TO, 0);
    assert.equal(result.left.rosterCountBefore, result.left.rosterCountAfter);
    assert.equal(JSON.stringify(s), before);
    const invalid = await client.callTool({ name: "fantasy_analyze_trade", arguments: { leftTeamId: left, rightTeamId: right, leftPlayerIds: [rightPlayers[0].id], rightPlayerIds: [] } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});
test("weekly, forecast and demo availability are explicit; errors hide server details", async () => {
  const s = fixture(), deps = dependencies(s), client = await connect(deps);
  try {
    const matchups = await call(client, "fantasy_get_matchups", { includePlayers: true });
    assert.equal(matchups.basis, "Actual weekly totals");
    assert.deepEqual(matchups.matchups[0].home.stats, s.matchups[0].home.stats);
    const missing = await call(client, "fantasy_get_matchups", { period: 999 });
    assert.equal(missing.available, false);
    const today = await call(client, "fantasy_get_today");
    assert.equal(today.available, false);
    const forecast = await client.callTool({ name: "fantasy_forecast_matchup", arguments: { teamId: s.teams[0].id, period: 999 } });
    assert.equal(forecast.isError, true);
    const badId = await client.callTool({ name: "fantasy_get_player", arguments: { playerId: 99999999 } });
    assert.equal(badId.isError, true);
    const badSchema = await client.callTool({ name: "fantasy_search_players", arguments: { limit: 10000, extra: true } });
    assert.equal(badSchema.isError, true);
    s.mode = "live";
    const error = await client.callTool({ name: "fantasy_get_game_boxscore", arguments: { gameId: "401234567" } });
    assert.equal(error.isError, true);
    assert.ok(!JSON.stringify(error).includes("private-secret"));
    const games = await call(client, "fantasy_get_player_games", { playerId: s.players[0].id });
    assert.equal(games.stale, true);
    const transactions = await call(client, "fantasy_get_transactions");
    assert.equal(transactions.importFailed, false);
    await call(client, "fantasy_get_trade_rankings");
    await call(client, "fantasy_get_auction_listings");
  } finally { await client.close(); }
});
test("listing tools remove stale ownership and keep notes as data; unavailable snapshots are tool errors", async () => {
  const s = fixture(), deps = dependencies(s), p = s.players.find(p => p.teamId !== null)!;
  deps.listings = async () => [
    { playerId: p.id, teamId: p.teamId!, active: true, version: 1, updatedAt: s.syncedAt, note: "Need assists" },
    { playerId: p.id, teamId: 999, active: true, version: 1, updatedAt: s.syncedAt, note: "Stale" },
  ];
  const client = await connect(deps);
  try {
    const listings = await call(client, "fantasy_get_auction_listings", { query: "assists" });
    assert.equal(listings.total, 1);
    assert.equal(listings.items[0].note, "Need assists");
    deps.loadLeague = async () => ({ snapshot: null, syncFailure: null });
    const result = await client.callTool({ name: "fantasy_get_league" });
    assert.equal(result.isError, true);
  } finally { await client.close(); }
});
test("HTTP rejects foreign origins, oversized bodies and invalid JSON; no SSE session required", async () => {
  const deps = dependencies();
  const request = (body: string, headers = {}) => new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body });
  assert.equal((await handleMcpRequest(request("{}", { origin: "https://evil.example" }), deps)).status, 403);
  assert.equal((await handleMcpRequest(request("x".repeat(32769)), deps)).status, 413);
  assert.equal((await handleMcpRequest(request("not json"), deps)).status, 400);
  for (const method of ["GET", "DELETE"]) assert.equal((await handleMcpRequest(new Request("http://localhost/mcp", { method }), deps)).status, 405);
  assert.equal((await handleMcpRequest(new Request("http://localhost/mcp", { method: "OPTIONS" }), deps)).status, 204);
});
test("forecast resolves scheduled opponents and daily results keep the prior slate date and coverage", async () => {
  const s = fixture(), home = s.teams[0].id, away = s.teams[1].id, deps = dependencies(s);
  s.mode = "live";
  const period = s.league.matchupPeriod + 1;
  s.forecastSchedule = { lineupDate: "2026-11-01", slots: ["UTIL"], pairs: [{ period, home, away }],
    windows: [{ period, start: "2026-11-02", end: "2026-11-08" }],
    games: [{ id: "401234567", startsAt: "2026-11-03T01:00:00Z", date: "2026-11-02", home: s.players[0].nbaTeam, away: s.players[1].nbaTeam, scoringPeriod: 11 }] };
  deps.loadToday = async () => ({ date: "2026-11-01", fetchedAt: "2026-11-01T19:00:00Z", status: "ready", games: [],
    performerDay: { date: "2026-10-31", fetchedAt: "2026-11-01T18:59:00Z", status: "stale", games: [], boxscoreStatus: "partial" } });
  const client = await connect(deps);
  try {
    const result = await call(client, "fantasy_forecast_matchup", { teamId: home });
    assert.equal(result.window.period, period);
    assert.equal(result.away.teamId, away);
    assert.equal(result.home.issue, null);
    assert.ok(result.categoryScore);
    const today = await call(client, "fantasy_get_today");
    assert.equal(today.date, "2026-11-01");
    assert.equal(today.performerDate, "2026-10-31");
    assert.equal(today.performerStatus, "stale");
    assert.equal(today.boxscoreStatus, "partial");
  } finally { await client.close(); }
});
