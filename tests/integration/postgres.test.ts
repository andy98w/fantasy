import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresBattleStore, VoteConflict } from '../../lib/battle-store';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must point to a disposable test PostgreSQL database.');
test('PostgreSQL votes serialize concurrent retries and persist across connections', async () => {
  const admin = new Pool({ connectionString: url });
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const makePool = () => new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
  const pool = makePool();
  const second = makePool();
  try {
    await pool.query(await readFile('db/schema.sql', 'utf8'));
    const a = new PostgresBattleStore(pool), b = new PostgresBattleStore(second);
    const vote = { requestId: randomUUID(), mode: 'best' as const, leftId: 'a:1', rightId: 'b:2', winnerId: 'a:1' };
    const results = await Promise.all([a.vote('test:1:2027', vote), b.vote('test:1:2027', vote)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await a.ratings('test:1:2027', 'best'))[0].votes, 1);
    await assert.rejects(b.vote('test:1:2027', { ...vote, winnerId: vote.rightId }), VoteConflict);
    await Promise.all(Array.from({ length: 8 }, () => b.vote('test:1:2027', { ...vote, requestId: randomUUID() })));
    const rows = await a.ratings('test:1:2027', 'best');
    assert.ok(rows.every(row => row.votes === 9));
    assert.equal(rows.reduce((sum, row) => sum + row.rating, 0), 2000);
    assert.deepEqual(await b.ratings('test:1:2028', 'best'), []);
    assert.equal(Number((await pool.query('SELECT count(*) FROM battle_votes')).rows[0].count), 9);
  } finally {
    await pool.end(); await second.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
