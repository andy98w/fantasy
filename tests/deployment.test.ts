import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('production entry point rejects demo, missing database and misplaced cookies without logging values', () => {
  for (const env of [
    { DATA_MODE: 'demo' },
    { DATA_MODE: 'live', ESPN_LEAGUE_ID: '1', ESPN_SEASON: '2027' },
    { DATA_MODE: 'live', ESPN_LEAGUE_ID: '1', ESPN_SEASON: '2027', DATABASE_URL: 'private-database-sentinel', ESPN_S2: 'secret-cookie-sentinel' },
  ]) {
    const result = spawnSync(process.execPath, ['scripts/start-production.mjs'], { env: { ...env, NODE_ENV: 'production' }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration required|worker only/);
    assert.ok(!result.stderr.includes('private-database-sentinel'));
    assert.ok(!result.stderr.includes('secret-cookie-sentinel'));
  }
});
