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
    ], categories: [], accounts: [], return_requests: [],
    orders: [
      { _id: 'today', userId: 'user', customer: { name: 'Canonical name' }, status: 'delivered',
        paymentStatus: 'paid', total: 100, createdAt: new Date('2026-11-08T17:30:00Z') },
      { _id: 'yesterday', userId: 'user', status: 'delivered', paymentStatus: 'paid',
        total: 200, createdAt: new Date('2026-11-08T16:59:59Z') },
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
  const db = { collection(name) {
    assert.equal(name, 'books');
    return {
      countDocuments: async () => 0,
      find: () => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, toArray: async () => [] }),
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
});
