// Exercise the built standalone package with fictional data; no ESPN or production DB.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
  assert.equal((await fetch(`${base}/api/ready`)).status, 503, 'Demo must not pass live readiness');
  for (const file of ['/.env', '/data/league.json', '/data/raw-latest.json'])
    assert.equal((await fetch(`${base}${file}`)).status, 404, `Private path exposed: ${file}`);
  console.log('Standalone smoke passed: page, assets, votes, readiness and private paths.');
} finally {
  const stopped = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode === null) { child.kill('SIGTERM'); await stopped; }
  await rm(scratch, { recursive: true, force: true });
}
