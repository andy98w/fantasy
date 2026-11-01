// Exercise the built standalone package with fictional data; no ESPN or production DB.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve('.next/standalone');
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.ok(entry.name !== '.env' && !entry.name.startsWith('.env.'), 'Environment file in standalone output');
    if (entry.isDirectory()) await inspect(path.join(dir, entry.name));
  }
}
await inspect(root);
assert.ok(!(await readdir(root)).includes('data'), 'Private runtime data in standalone output');
const scratch = await mkdtemp(path.join(tmpdir(), 'fantasy-smoke-'));
const port = process.env.SMOKE_PORT ?? '3099';
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(root, 'server.js')], {
  env: { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    DATA_MODE: 'demo', DATABASE_URL: '', HOSTNAME: '127.0.0.1', PORT: port,
    BATTLE_DB_PATH: path.join(scratch, 'votes.sqlite') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
try {
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`Standalone exited: ${output}`);
    try { healthy = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(healthy, 'Standalone did not become healthy');
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('Fantasy'));
  const assets = [...html.matchAll(/(?:src|href)="([^"?]*\/_next\/static\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
  assert.ok(assets.length > 0, 'No bundled assets found');
  for (const asset of new Set(assets)) assert.equal((await fetch(new URL(asset, base))).status, 200, `Missing ${asset}`);
  assert.equal((await fetch(`${base}/api/trade-battles`)).status, 200);
  const mcp = new Client({ name: 'production-smoke', version: '1.0.0' });
  try {
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await mcp.listTools();
    assert.equal(tools.length, 16);
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));
    const league = await mcp.callTool({ name: 'fantasy_get_league', arguments: {} });
    assert.notEqual(league.isError, true);
    assert.equal(league.structuredContent.metadata.mode, 'demo');
    const players = await mcp.callTool({ name: 'fantasy_search_players', arguments: { limit: 2 } });
    assert.equal(players.structuredContent.items.length, 2);
    const history = await mcp.callTool({ name: 'fantasy_get_power_history', arguments: { kind: 'team', id: league.structuredContent.teams[0].id } });
    assert.notEqual(history.isError, true);
    assert.equal(history.structuredContent.source, 'demo');
    const invalid = await mcp.callTool({ name: 'fantasy_search_players', arguments: { limit: 1000 } });
    assert.equal(invalid.isError, true);
  } finally { await mcp.close(); }

  const demo = JSON.parse(await readFile('lib/demo.json', 'utf8'));
  const player = demo.players.find(p => p.teamId !== null);
  const postListing = body => fetch(`${base}/api/auction`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
  const listing = { action: 'save', playerId: player.id, teamId: player.teamId, note: 'Assists', version: 0 };
  assert.equal((await postListing({ ...listing, teamId: 999999 })).status, 409);
  assert.equal((await postListing({ ...listing, note: 'x'.repeat(241) })).status, 400);
  const saved = await postListing(listing);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).listing.version, 1);
  assert.equal((await postListing(listing)).status, 200, 'Safe retry');
  assert.equal((await postListing({ ...listing, note: 'Conflicting edit' })).status, 409);
  const board = await (await fetch(`${base}/api/auction`)).json();
  assert.equal(board.listings.length, 1);
  assert.equal(board.listings[0].active, true);
  assert.equal((await postListing({ ...listing, action: 'close', version: 1 })).status, 200);
  assert.equal((await (await fetch(`${base}/api/auction`)).json()).listings[0].active, false);
  assert.equal((await fetch(`${base}/api/ready`)).status, 503, 'Demo must not pass live readiness');
  for (const file of ['/.env', '/data/league.json', '/data/raw-latest.json'])
    assert.equal((await fetch(`${base}${file}`)).status, 404, `Private path exposed: ${file}`);
  console.log('Standalone smoke passed: page, assets, MCP, votes, auction listings, readiness and private paths.');
} finally {
  const stopped = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode === null) { child.kill('SIGTERM'); await stopped; }
  await rm(scratch, { recursive: true, force: true });
}
