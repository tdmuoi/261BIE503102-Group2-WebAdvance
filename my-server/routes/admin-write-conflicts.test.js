const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');
const revisions = require('../middleware/admin-revision');

test('Admin revisions preserve legacy null, detect stale snapshots and advance monotonically', () => {
  assert.equal(revisions.revision({}), null);
  assert.deepEqual(revisions.snapshot({}), { updatedAt: { $exists: false } });
  assert.doesNotThrow(() => revisions.requireRevision({ revision: null }, {}));
  assert.doesNotThrow(() => revisions.requireRevision({ revision: '2026-01-01T00:00:00Z' }, { updatedAt: new Date('2026-01-01T00:00:00.000Z') }));
  assert.throws(() => revisions.requireRevision({}, {}), (e) => e.status === 409);
  assert.throws(() => revisions.requireRevision({ revision: null }, { updatedAt: 'invalid' }), (e) => e.status === 409);
  const future = new Date('2099-01-01T00:00:00Z');
  assert.equal(+revisions.nextUpdatedAt({ updatedAt: future }), +future + 1);
});

test('Books and banners reject stale edits before writes and use atomic revision predicates', async (t) => {
  const bookId = new ObjectId(), bannerId = new ObjectId(), categoryId = new ObjectId();
  const initial = new Date('2026-01-01T00:00:00Z');
  const docs = {
    books: [{ _id: bookId, title: 'Original', categoryId, authorId: null, bookType: 'new',
      price: 100, originalPrice: 100, stock: 5, status: 'active', updatedAt: initial }],
    categories: [{ _id: categoryId, name: 'Fixture', slug: 'fixture' }], authors: [],
    banners: [{ _id: bannerId, name: 'Original', title: 'Fixture', position: 'hero', active: true, updatedAt: initial }],
    users: [],
    orders: [{ _id: new ObjectId(), userId: new ObjectId(), status: 'pending', items: [], updatedAt: initial }],
    return_requests: [{ _id: new ObjectId(), userId: new ObjectId(), status: 'pending', items: [], updatedAt: initial }],
  };
  let writes = 0, interfere = false;
  const equal = (a, b) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : String(a) === String(b);
  function match(doc, query) {
    return Object.entries(query).every(([key, value]) => {
      if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
        if ('$in' in value) return value.$in.some((v) => equal(doc[key], v));
        if ('$ne' in value) return !equal(doc[key], value.$ne);
        if ('$exists' in value) return Object.hasOwn(doc, key) === value.$exists;
      }
      return equal(doc[key], value);
    });
  }
  const db = { collection: (name) => ({
    findOne: async (query) => docs[name].find((doc) => match(doc, query)) ?? null,
    find: (query = {}) => ({
      project() { return this; }, sort() { return this; }, limit() { return this; },
      toArray: async () => docs[name].filter((doc) => match(doc, query)),
    }),
    updateOne: async (query, update) => {
      assert.ok(Object.hasOwn(query, 'updatedAt'), 'mutation must compare the loaded revision');
      if (interfere) return { matchedCount: 0 };
      const doc = docs[name].find((doc) => match(doc, query));
      if (!doc) return { matchedCount: 0 };
      writes++; Object.assign(doc, update.$set);
      return { matchedCount: 1 };
    },
    insertOne: async () => { throw new Error('No insert expected'); },
  }) };
  const app = express(); app.use(express.json());
  app.use(require('./admin-books')(() => db));
  app.use(require('./admin-banners')(() => db));
  app.use(require('./admin-orders')(() => db));
  app.use(require('./admin-returns')(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = (path, body, method = 'PUT') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const book = { title: 'Updated', categoryId: String(categoryId), bookType: 'new', price: 100, stock: 5, status: 'active' };
  assert.equal((await put('/books/' + bookId, book)).status, 409);
  assert.equal(writes, 0);
  assert.equal((await put('/books/' + bookId, { ...book, revision: initial.toISOString() })).status, 200);
  assert.equal(writes, 1);
  assert.equal((await put('/books/' + bookId, { ...book, revision: initial.toISOString() })).status, 409);
  assert.equal(writes, 1);
  interfere = true;
  assert.equal((await put('/books/' + bookId, { ...book, revision: new Date(docs.books[0].updatedAt).toISOString() })).status, 409);
  assert.equal(writes, 1);
  interfere = false;
  const banner = { name: 'Updated', title: 'Fixture', position: 'hero', active: true };
  assert.equal((await put('/admin/banners/' + bannerId, banner)).status, 409);
  assert.equal((await put('/admin/banners/' + bannerId, { ...banner, revision: initial.toISOString() })).status, 200);
  const before = writes;
  assert.equal((await put('/admin/banners/' + bannerId, { active: false, revision: initial.toISOString() }, 'PATCH')).status, 409);
  assert.equal(writes, before);
  assert.equal((await put('/admin/banners', { ...banner, active: 'false' }, 'POST')).status, 400);
  assert.equal(writes, before);
  assert.equal((await put('/admin/banners/' + bannerId, { revision: initial.toISOString() }, 'DELETE')).status, 409);
  assert.equal(writes, before);
  for (const [path, doc] of [['orders', docs.orders[0]], ['returns', docs.return_requests[0]]]) {
    assert.equal((await put(`/${path}/${doc._id}`, { adminNote: 'New note', revision: initial.toISOString() }, 'PATCH')).status, 200);
    const after = writes;
    assert.equal((await put(`/${path}/${doc._id}`, { adminNote: 'Stale note', revision: initial.toISOString() }, 'PATCH')).status, 409);
    assert.equal(writes, after);
    assert.equal(doc.adminNote, 'New note');
  }
});

test('Orders/Returns reject invalid calendar dates before database queries', async (t) => {
  const range = require('../middleware/admin-date-range');
  assert.equal(range({ from: '2026-11-08' }).from.toISOString(), '2026-11-07T17:00:00.000Z');
  assert.equal(range({ to: '2026-11-08' }).to.toISOString(), '2026-11-08T16:59:59.999Z');
  const app = express();
  const getDb = () => { throw new Error('No DB query permitted for invalid filters'); };
  app.use(require('./admin-orders')(getDb));
  app.use(require('./admin-returns')(getDb));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const resource of ['orders', 'returns']) {
    for (const query of ['from=2026-02-30', 'to=2026-13-01', 'from=x', 'from=2026-11-10&to=2026-11-08']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/${resource}?${query}`);
      assert.equal(response.status, 400);
    }
  }
});

test('Banner reorder commits atomically and rolls back if a later banner changed', async (t) => {
  const a = new ObjectId(), b = new ObjectId();
  let rows = [{ _id: a, position: 'hero', order: 1 }, { _id: b, position: 'hero', order: 2 }];
  let failSecond = false, updates = 0, ended = 0;
  const db = {
    admin: () => ({ command: async () => ({ setName: 'fixture' }) }),
    client: { startSession: () => ({
      async withTransaction(work) {
        const snapshot = rows.map((row) => ({ ...row }));
        try { return await work(); } catch (error) { rows = snapshot; throw error; }
      },
      async endSession() { ended++; },
    }) },
    collection: () => ({
      find: (query) => ({ toArray: async () => rows.filter((row) => query._id.$in.some((id) => String(id) === String(row._id))) }),
      updateOne: async (query, update, options) => {
        assert.ok(options.session);
        if (failSecond && String(query._id) === String(b)) return { matchedCount: 0 };
        const row = rows.find((row) => String(row._id) === String(query._id));
        if (!row) return { matchedCount: 0 };
        updates++; Object.assign(row, update.$set); return { matchedCount: 1 };
      },
    }),
  };
  const app = express(); app.use(express.json()); app.use(require('./admin-banners')(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const send = (ids, revisions) => fetch(`http://127.0.0.1:${server.address().port}/admin/banners/reorder`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, revisions }),
  });
  const ids = [String(a), String(b)], revisionsMap = { [a]: null, [b]: null };
  failSecond = true;
  assert.equal((await send(ids, revisionsMap)).status, 409);
  assert.equal(rows[0].updatedAt, undefined);
  assert.equal(rows[1].updatedAt, undefined);
  assert.equal(ended, 1);
  failSecond = false;
  assert.equal((await send([...ids].reverse(), revisionsMap)).status, 200);
  assert.equal(rows.find((row) => String(row._id) === String(b)).order, 1);
  const before = updates;
  assert.equal((await send(ids, revisionsMap)).status, 409);
  assert.equal(updates, before);
  assert.equal((await send([String(a), String(a)], revisionsMap)).status, 400);
  delete db.client;
  const fresh = Object.fromEntries(rows.map((row) => [String(row._id), row.updatedAt.toISOString()]));
  assert.equal((await send(ids, fresh)).status, 503);
  assert.equal(updates, before);
});
