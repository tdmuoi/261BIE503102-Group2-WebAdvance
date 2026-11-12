// No network database, environment credentials, or Atlas access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const access = require('../middleware/admin-qa-access');

test('Admin resource methods require the correct operation permission', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', access({
    requireAdmin(req, res, next) {
      if (!req.headers['x-fixture-module']) return res.sendStatus(401);
      next();
    },
    requirePermission(module, action) {
      return (req, res, next) => {
        if (req.headers['x-fixture-module'] !== module || req.headers['x-fixture-action'] !== action)
          return res.sendStatus(403);
        next();
      };
    },
  }));
  app.use((_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  for (const resource of ['books', 'orders', 'returns', 'dashboard', 'banners']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await fetch(`${base}/${resource}`, { method })).status, 401);
    }
  }
  const request = (path, module, action, body, method = body ? 'PATCH' : 'GET') => fetch(base + path, {
    method, headers: { 'x-fixture-module': module, 'x-fixture-action': action, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request('/books/inventory', 'inventory', 'view')).status, 204);
  assert.equal((await request('/BOOKS/INVENTORY/', 'inventory', 'view')).status, 204);
  assert.equal((await request('/books', 'inventory', 'view')).status, 403);
  assert.equal((await request('/books/inventory', 'products', 'view')).status, 403);
  assert.equal((await request('/books/inventory/stock-in', 'products', 'create', {}, 'POST')).status, 403);
  assert.equal((await request('/books/inventory/stock-in', 'inventory', 'view', {}, 'POST')).status, 403);
  assert.equal((await request('/BOOKS/INVENTORY/STOCK-IN/', 'inventory', 'adjust_inventory', {}, 'POST')).status, 204);
  assert.equal((await request('/books/inventory/history', 'inventory', 'view')).status, 204);
  assert.equal((await request('/books/123/pdf', 'products', 'create', {}, 'POST')).status, 403);
  assert.equal((await request('/books/123/pdf', 'products', 'update', {}, 'POST')).status, 204);
  assert.equal((await request('/books/bulk/', 'products', 'update', { action: 'delete' })).status, 403);
  assert.equal((await request('/books/bulk/', 'products', 'delete', { action: 'delete' })).status, 204);
  assert.equal((await request('/orders/id/STATUS/', 'orders', 'update', { status: 'confirmed' })).status, 403);
  assert.equal((await request('/orders/id/status', 'orders', 'confirm', { status: 'confirmed' })).status, 204);
  assert.equal((await request('/orders/id/status', 'orders', 'confirm', { status: 'cancelled', paymentStatus: 'paid' })).status, 403);
  assert.equal((await request('/returns/id/status', 'orders', 'confirm', { status: 'refunded' })).status, 403);
});

test('Real session middleware rejects anonymous resource requests before database access', async (t) => {
  const app = express();
  const auth = require('../middleware/admin-auth')(() => { throw new Error('DB must not be reached'); });
  app.use('/api/admin', access(auth));
  app.use((_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  for (const resource of ['books', 'books/inventory', 'orders', 'returns', 'dashboard', 'banners'])
    assert.equal((await fetch(base + '/' + resource)).status, 401);
});

test('Dashboard uses Vietnam day boundaries, canonical customer names and verified stock', async () => {
  const build = require('./admin-dashboard').buildDashboard;
  const now = new Date('2026-11-08T18:00:00Z'); // Nov 9 in Vietnam
  const data = {
    books: [
      { _id: 'missing', status: 'active', bookType: 'new' },
      { _id: 'null', status: 'active', bookType: 'new', stock: null },
      { _id: 'zero', status: 'active', bookType: 'new', stock: 0 },
      { _id: 'low', status: 'active', bookType: 'used', stock: 3 },
      { _id: 'ebook', status: 'active', bookType: 'ebook', stock: 0 },
    ], categories: [], accounts: [{ _id: 'account', roleCode: 'CUSTOMER' }],
    users: [{ _id: 'user', accountId: 'account', fullName: 'Profile name' }], return_requests: [],
    orders: [
      { _id: 'today', userId: 'user', customer: { name: 'Canonical name' }, status: 'delivered',
        paymentStatus: 'paid', paymentMethod: 'cod', total: 100, createdAt: new Date('2026-11-08T17:30:00Z'),
        paidAt: new Date('2026-11-08T17:30:00Z'), paymentVerification: { source: 'cod_delivery', verifiedAt: new Date('2026-11-08T17:30:00Z') } },
      { _id: 'yesterday', userId: 'user', status: 'delivered', paymentStatus: 'paid',
        paymentMethod: 'cod', total: 200, createdAt: new Date('2026-11-08T16:59:59Z'),
        paidAt: new Date('2026-11-08T16:59:59Z'), paymentVerification: { source: 'cod_delivery', verifiedAt: new Date('2026-11-08T16:59:59Z') } },
    ],
  };
  const db = {
    listCollections: () => ({ toArray: async () => Object.keys(data).map((name) => ({ name })) }),
    collection: (name) => ({ find: () => ({ toArray: async () => data[name] }) }),
  };
  const result = await build(db, 1, now);
  assert.equal(result.period.from.toISOString(), '2026-11-08T17:00:00.000Z');
  assert.equal(result.stats.revenue.value, 100);
  assert.equal(result.salesChart[0].date, '2026-11-9');
  assert.equal(result.salesChart[0].revenue, 100);
  assert.equal(result.recentOrders[0].customerName, 'Canonical name');
  assert.equal(result.inventory.outOfStockCount, 1);
  assert.equal(result.inventory.lowStockCount, 1);
});

test('Inventory read endpoint returns the catalog pagination contract without writes', async (t) => {
  let filter, sort;
  const db = { collection(name) {
    assert.equal(name, 'books');
    return {
      countDocuments: async () => 0,
      find: query => { filter = query; return { sort(value) { sort = value; return this; }, skip() { return this; }, limit() { return this; }, toArray: async () => [] }; },
    };
  } };
  const app = express();
  app.use(require('./admin-books')(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/books/inventory?page=2&limit=100`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.page, 2);
  assert.equal(result.limit, 100);
  assert.equal(result.total, 0);
  assert.equal(result.lowStockThreshold, 5);
  assert.deepEqual(result.items, []);
  assert.deepEqual(filter.isDemo, { $ne: true });
  assert.equal(sort._id, 1);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/books/inventory`, { method: 'POST' })).status, 404);
});


test('Dashboard joins profiles/accounts, uses verified payment dates, and excludes demo/unverified revenue', async () => {
  const now = new Date('2026-11-12T05:00:00Z'), paidAt = new Date('2026-11-11T18:00:00Z');
  const proof = { source: 'cod_delivery', verifiedAt: paidAt };
  const base = { userId: 'profile', status: 'delivered', paymentStatus: 'paid', paymentMethod: 'cod',
    total: 100, createdAt: new Date('2026-10-01'), paidAt, paymentVerification: proof };
  const data = {
    accounts: [{ _id: 'account', roleCode: 'CUSTOMER', email: 'fallback@example.invalid' },
      { _id: 'root', roleCode: 'SUPER_ADMIN' }, { _id: 'demo-account', roleCode: 'CUSTOMER', isDemo: true }],
    users: [{ _id: 'profile', accountId: 'account' }, { _id: 'root-profile', accountId: 'root' },
      { _id: 'demo-profile', accountId: 'demo-account' }],
    orders: [{ ...base, _id: 'paid-today' },
      { ...base, _id: 'paid-yesterday', total: 200, createdAt: paidAt, paidAt: new Date('2026-11-10T18:00:00Z'),
        paymentVerification: { source: 'cod_delivery', verifiedAt: new Date('2026-11-10T18:00:00Z') } },
      { ...base, _id: 'self-confirmed-legacy', paymentVerification: undefined },
      { ...base, _id: 'unverified-time', paidAt: null },
      { ...base, _id: 'demo-order', isDemo: true },
      { ...base, _id: 'admin-order', userId: 'root-profile' },
      { ...base, _id: 'orphan', userId: 'unknown' },
      { ...base, _id: 'demo-owner', userId: 'demo-profile' }],
    return_requests: ['pending', 'approved', 'received', 'refunded'].map((status) => ({ userId: 'profile', orderId: 'paid-today', status }))
      .concat([{ userId: 'profile', orderId: 'paid-today', status: 'pending', isDemo: true },
        { userId: 'demo-profile', orderId: 'paid-today', status: 'pending' },
        { userId: 'profile', orderId: 'demo-order', status: 'pending' },
        { userId: 'profile', orderId: 'missing', status: 'pending' }]),
    books: [{ _id: 'ebook', bookType: 'ebook', stock: 0, status: 'active' },
      { _id: 'demo', bookType: 'new', stock: 0, status: 'active', isDemo: true }], categories: [],
  };
  const before = JSON.stringify(data);
  const db = { listCollections: () => ({ toArray: async () => Object.keys(data).map((name) => ({ name })) }),
    collection: (name) => ({ find: () => ({ toArray: async () => data[name] }) }) };
  const result = await require('./admin-dashboard').buildDashboard(db, 1, now);
  assert.equal(result.reportingPolicy, 'paid-verified-v2');
  assert.equal(result.stats.revenue.value, 100);
  assert.equal(result.stats.revenue.change, -50);
  assert.equal(result.salesChart[0].revenue, 100);
  assert.equal(result.salesChart[0].orders, 1);
  assert.equal(result.stats.customers.value, 1);
  assert.equal(result.stats.pendingReturns.value, 3);
  assert.equal(result.excludedUnverifiedPayments, 2);
  assert.ok(result.recentOrders.every((order) => order.customerName === 'fallback@example.invalid'));
  assert.equal(result.inventory.outOfStockCount, 0);
  assert.equal(JSON.stringify(data), before);
});
