import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { SocialCounter } from '../worker.js';
function setup() {
  const db = new DatabaseSync(':memory:');
  let alarm = null;
  const storage = {
    sql: { exec(sql, ...args) { const q = db.prepare(sql); return { toArray: () => q.all(...args) }; } },
    transactionSync(fn) { db.exec('BEGIN'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async getAlarm() { return alarm; }, async setAlarm(value) { alarm = value; }
  };
  // DO SQL executes eagerly (Node statement.all also supports write statements).
  storage.sql.exec = (sql, ...args) => { const rows = db.prepare(sql).all(...args); return { toArray: () => rows }; };
  const counter = new SocialCounter({ storage });
  const env = { SIGNING_SECRET: 'test-secret-for-local-test-only-32-bytes', ALLOWED_ORIGIN: 'https://rogerfilmshn.github.io', SOCIAL: { idFromName: x => x, get: () => counter } };
  const call = async (action, body = {}, headers = {}) => {
    const response = await worker.fetch(new Request(`https://test/${action}`, { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', ...headers }, body: JSON.stringify(body) }), env);
    return { status: response.status, data: await response.json() };
  };
  return { call, counter, db, env };
}
test('real SQLite persists totals, deduplicates reloads, synchronizes two identities, idempotent likes/unlikes', async () => {
  const { call, db } = setup();
  const a = (await call('session')).data.token;
  const b = (await call('session', {}, { 'CF-Connecting-IP': '192.0.2.20' })).data.token;
  assert.equal((await call('visit', { token: a })).data.visits, 1);
  const reloads = await Promise.all(Array.from({ length: 8 }, () => call('visit', { token: a })));
  assert.ok(reloads.every(r => r.data.visits === 1));
  assert.equal((await call('visit', { token: b })).data.visits, 2);
  await Promise.all([call('like', { token: a, liked: true }), call('like', { token: a, liked: true }), call('like', { token: b, liked: true })]);
  assert.equal((await call('stats', { token: a })).data.likes, 2);
  assert.equal((await call('session', { token: a })).data.token, a);
  assert.equal((await call('like', { token: a, liked: false })).data.likes, 1);
  assert.equal((await call('like', { token: a, liked: false })).data.likes, 1);
  assert.equal((await call('stats', { token: b })).data.liked, true);
  db.prepare('UPDATE visits SET at=?').run(Date.now() - 1800001);
  assert.equal((await call('visit', { token: a })).data.visits, 3);
});
test('rejects forged credentials, arbitrary totals, hostile origin, invalid inputs', async () => {
  const { call } = setup();
  const token = (await call('session')).data.token;
  assert.equal((await call('like', { token: token.slice(0, -1) + 'zz', liked: true })).status, 401);
  assert.equal((await call('like', { token, likes: 999, liked: true })).status, 400);
  assert.equal((await call('visit', { token, visits: 999 })).status, 400);
  assert.equal((await call('like', { token, liked: 'true' })).status, 400);
  assert.equal((await call('stats', { token }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('stats', { token: 12 })).status, 400);
  assert.equal((await call('stats', { token })).data.likes, 0);
});
test('throttles browser-identity resets and like spam on server', async () => {
  const { call } = setup();
  const token = (await call('session')).data.token;
  for (let i = 0; i < 9; i++) assert.equal((await call('session')).status, 200);
  assert.equal((await call('session')).status, 429);
  for (let i = 0; i < 15; i++) assert.equal((await call('like', { token, liked: true })).status, 200);
  assert.equal((await call('like', { token, liked: true })).status, 429);
  assert.equal((await call('stats', { token })).data.likes, 1);
});
test('temporary data expires; active likes and global totals survive object reconstruction', async () => {
  const { call, counter, db } = setup();
  const token = (await call('session')).data.token;
  await call('visit', { token });
  await call('like', { token, liked: true });
  db.prepare('UPDATE visits SET at=0').run();
  db.prepare('UPDATE limits SET expires=0').run();
  await counter.alarm();
  assert.equal(db.prepare('SELECT count(*) n FROM visits').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM limits').get().n, 0);
  const restarted = new SocialCounter(counter.ctx);
  assert.equal(restarted.first('SELECT visits FROM totals').visits, 1);
  assert.equal(restarted.first('SELECT likes FROM totals').likes, 1);
});
