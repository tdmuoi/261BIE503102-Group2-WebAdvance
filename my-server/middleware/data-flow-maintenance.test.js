const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');
const prepare = require('./prepare-data-flows');

test('Legacy OTP migration preserves active challenge identity and never overwrites consumed canonical codes', async () => {
  const original = { _id: new ObjectId(), challengeId: 'a'.repeat(48), codeHash: 'hashed', attempts: 3, expiresAt: new Date(Date.now() + 60000), consumedAt: null };
  const rows = [];
  const db = {
    listCollections: () => ({ toArray: async () => [{ name: 'otp_challenges' }] }),
    collection: name => name === 'otp_challenges' ? { find: query => {
      assert.ok(query.expiresAt.$gt instanceof Date);
      return [original];
    } } : {
      async createIndex() {},
      listIndexes: () => ({ toArray: async () => [] }),
      async updateOne(query, update, options) {
        assert.equal(options.upsert, true); assert.equal(String(query._id), String(original._id));
        if (rows.length) return { upsertedCount: 0 };
        rows.push({ ...query, ...update.$setOnInsert }); return { upsertedCount: 1 };
      },
    },
  };
  await prepare(db); assert.deepEqual(rows[0], original);
  rows[0].consumedAt = new Date(); rows[0].attempts = 4;
  await prepare(db); assert.equal(rows.length, 1); assert.equal(rows[0].attempts, 4); assert.ok(rows[0].consumedAt);
});

test('Audit records successful admin mutations without secrets; ignores reads, failed and anonymous writes', async t => {
  const rows = [];
  const app = express(); app.use(express.json());
  app.use(require('./admin-audit-log')(() => ({ collection: () => ({ insertOne: async row => rows.push(row) }) })));
  app.all('/api/admin/books/:id', (req, res) => {
    if (req.get('X-Test-Admin')) req.admin = { _id: '000000000000000000000001', roleCode: 'SUPER_ADMIN' };
    res.status(req.get('X-Test-Fail') ? 409 : 200).json({ token: 'private' });
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/books/123?token=secret`;
  for (const [method, admin, fail] of [['GET', true, false], ['PATCH', false, false], ['PATCH', true, true], ['PATCH', true, false]]) {
    await fetch(url, { method, headers: { ...(admin ? { 'X-Test-Admin': '1' } : {}), ...(fail ? { 'X-Test-Fail': '1' } : {}), 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify({ password: 'secret', otp: '123456' }) }) });
  }
  assert.equal(rows.length, 1); assert.equal(rows[0].details.path, '/api/admin/books/123');
  assert.equal(String(rows[0].actorId), '000000000000000000000001'); assert.equal(rows[0].action, 'PATCH');
  assert.equal(JSON.stringify(rows).includes('secret'), false); assert.equal(JSON.stringify(rows).includes('private'), false);
});

test('Real admin login/logout are audited with a verified actor and without credentials, cookies or CSRF', async t => {
  const audit = require('./admin-audit-log'), bcrypt = require('bcryptjs');
  const { randomBytes } = require('node:crypto');
  const password = randomBytes(24).toString('hex'), actorId = new ObjectId(), rows = [];
  const account = { _id: actorId, email: String(actorId) + '@example.invalid', roleCode: 'SUPER_ADMIN',
    provider: 'local', status: 'active', passwordHash: await bcrypt.hash(password, 10) };
  const db = { collection(name) {
    if (name === 'audit_logs') return { insertOne: async row => { rows.push(row); } };
    if (name === 'accounts') return { find: () => ({ project: () => ({ limit: () => ({ toArray: async () => [account] }) }) }), findOne: async () => account };
    if (name === 'roles') return { findOne: async () => ({ code: 'SUPER_ADMIN', name: 'Admin', permissions: [] }) };
    if (name === 'users') return { findOne: async () => ({ _id: new ObjectId(), fullName: 'Fixture Admin' }) };
    throw new Error('Unexpected collection: ' + name);
  } };
  const app = express(); app.use(express.json());
  app.use('/api/admin', audit(() => db));
  app.use('/api/admin/auth', require('../routes/admin-auth')(() => db));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/auth`;
  const headers = { Origin: 'http://localhost:4201', 'Content-Type': 'application/json' };
  const bad = await fetch(base + '/login', { method: 'POST', headers,
    body: JSON.stringify({ email: account.email, password: 'wrong', rememberMe: false }) });
  assert.equal(bad.status, 401); assert.equal(rows.length, 0);
  const login = await fetch(base + '/login', { method: 'POST', headers,
    body: JSON.stringify({ email: account.email, password, rememberMe: false }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0], response = await login.json();
  assert.equal(rows.length, 1); assert.equal(rows[0].action, 'auth.login');
  assert.equal(String(rows[0].actorId), String(actorId));
  const session = await fetch(base + '/session', { headers: { ...headers, Cookie: cookie } });
  assert.equal(session.status, 200); assert.equal(rows.length, 1);
  const denied = await fetch(base + '/logout', { method: 'POST', headers: { ...headers, Cookie: cookie, 'X-Admin-CSRF': 'wrong' }, body: '{}' });
  assert.equal(denied.status, 403); assert.equal(rows.length, 1);
  const logout = await fetch(base + '/logout', { method: 'POST', headers: { ...headers, Cookie: cookie, 'X-Admin-CSRF': response.csrfToken }, body: '{}' });
  assert.equal(logout.status, 204); assert.equal(rows.length, 2);
  assert.equal(rows[1].action, 'auth.logout'); assert.equal(String(rows[1].actorId), String(actorId));
  const serialized = JSON.stringify(rows);
  for (const secret of [password, account.passwordHash, response.csrfToken, cookie]) assert.equal(serialized.includes(secret), false);
  await fetch(base + '/logout', { method: 'POST', headers, body: '{}' });
  assert.equal(rows.length, 2, 'anonymous logout cannot manufacture an audit actor');
});

test('Startup audit identifies the actual backend lifecycle event without a fake administrator', async () => {
  const rows = [], db = { databaseName: 'fixture', collection: name => {
    assert.equal(name, 'audit_logs'); return { insertOne: async row => { rows.push(row); } };
  } };
  await require('./admin-audit-log').recordServerStart(db, 3002);
  assert.equal(rows.length, 1); assert.equal(rows[0].actorId, null);
  assert.equal(rows[0].action, 'server.started'); assert.equal(rows[0].source, 'backend_lifecycle');
  assert.deepEqual(rows[0].details, { database: 'fixture', port: 3002 }); assert.ok(rows[0].createdAt instanceof Date);
});

test('OTP keeps the expiresAt TTL and removes only the conflicting legacy createdAt TTL', async () => {
  const indexes = [{ name: '_id_', key: { _id: 1 } },
    { name: 'otp_expire', key: { createdAt: 1 }, expireAfterSeconds: 600 },
    { name: 'challengeId_1', key: { challengeId: 1 }, unique: true },
    { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 3600 }];
  const dropped = [];
  const db = { collection: name => {
    assert.equal(name, 'otp');
    return {
      async createIndex() {},
      listIndexes: () => ({ toArray: async () => indexes }),
      async dropIndex(name) { dropped.push(name); indexes.splice(indexes.findIndex(i => i.name === name), 1); },
    };
  } };
  await prepare.prepareOtpStorage(db); await prepare.prepareOtpStorage(db);
  assert.deepEqual(dropped, ['otp_expire']);
  assert.ok(indexes.some(i => i.key.expiresAt === 1 && i.expireAfterSeconds === 3600));
  assert.ok(indexes.some(i => i.unique));
});

function shipmentFixture() {
  const userId = new ObjectId(), now = new Date();
  const physical = () => ({ _id: new ObjectId(), userId, orderCode: 'fixture', status: 'pending',
    shippingAddress: { address: 'Fixture' }, items: [{ format: 'print' }], createdAt: now, updatedAt: now });
  const orders = [physical(), physical(), { ...physical(), isDemo: true },
    { ...physical(), items: [{ format: 'ebook' }] }, { ...physical(), userId: null }];
  let shipments = [], writes = 0, failAt = null;
  const session = {
    async withTransaction(work) {
      const before = shipments.map(row => ({ ...row }));
      try { return await work(); } catch (error) { shipments = before; throw error; }
    },
    async endSession() {},
  };
  const db = {
    client: { startSession: () => session }, admin: () => ({ command: async () => ({ setName: 'fixture' }) }),
    collection: name => name === 'orders' ? {
      find(query, options) {
        assert.equal(options.session, session);
        return (async function* () { for (const order of orders) if (order.isDemo !== true && order.userId && order.shippingAddress) yield order; })();
      },
    } : {
      async findOne(query, options) {
        assert.equal(options.session, session);
        return shipments.find(row => query.$or.some(branch => Object.entries(branch).every(([key, value]) => String(row[key]) === String(value)))) || null;
      },
      async updateOne(query, update, options) {
        assert.equal(options.session, session);
        if (++writes === failAt) throw new Error('Injected shipment failure');
        let row = shipments.find(row => String(row._id) === String(query._id));
        const fields = row ? update.$set : { ...update.$setOnInsert, ...update.$set };
        // Match the live partial unique trackingCode index, including empty strings.
        if (typeof fields?.trackingCode === 'string' && shipments.some(other => other !== row && other.trackingCode === fields.trackingCode))
          throw Object.assign(new Error('Duplicate tracking code'), { code: 11000 });
        if (!row) { row = { ...query, ...fields }; shipments.push(row); return { upsertedCount: 1 }; }
        Object.assign(row, fields); return { upsertedCount: 0 };
      },
    },
  };
  return { db, orders, session, get shipments() { return shipments; }, failSecondWrite() { failAt = 2; } };
}

test('Backfill creates missing shipments without inventing codes, modifying orders or duplicating on replay', async () => {
  const f = shipmentFixture(), backfill = require('./backfill-shipments');
  const before = f.orders.map(row => ({ ...row }));
  assert.deepEqual(await backfill(f.db), { eligible: 2, inserted: 2, existing: 0 });
  assert.equal(f.shipments.length, 2); assert.ok(f.shipments.every(row => row.trackingCode === null));
  assert.deepEqual(f.orders, before);
  f.shipments[0].status = 'existing-status';
  assert.deepEqual(await backfill(f.db), { eligible: 2, inserted: 0, existing: 2 });
  assert.equal(f.shipments[0].status, 'existing-status');
});

test('Shipment backfill recognizes legacy orderId links and rolls back all inserts on failure', async () => {
  const f = shipmentFixture(), backfill = require('./backfill-shipments');
  f.shipments.push({ _id: new ObjectId(), orderId: f.orders[0]._id, trackingCode: 'EXISTING', status: 'shipping' });
  const original = { ...f.shipments[0] };
  assert.deepEqual(await backfill(f.db), { eligible: 2, inserted: 1, existing: 1 });
  assert.deepEqual(f.shipments[0], original);
  const failing = shipmentFixture(); failing.failSecondWrite();
  await assert.rejects(backfill(failing.db), /Injected shipment failure/);
  assert.equal(failing.shipments.length, 0);
});

test('Live shipment sync accepts multiple pending orders with no code and retains actual tracking values', async () => {
  const f = shipmentFixture(), sync = require('./shipment-sync');
  await sync(f.db, f.orders[0], f.session); await sync(f.db, { ...f.orders[1], trackingCode: '  ' }, f.session);
  assert.equal(f.shipments.length, 2); assert.ok(f.shipments.every(row => row.trackingCode === null));
  await sync(f.db, { ...f.orders[0], trackingCode: 'REAL-CODE' }, f.session);
  assert.equal(f.shipments[0].trackingCode, 'REAL-CODE');
});
