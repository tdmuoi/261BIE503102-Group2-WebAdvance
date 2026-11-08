// Business logic fixtures only: never opens a MongoDB connection.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const transition = require('../middleware/admin-safe-status');

function fixture({ ebook = false, missingBook = false } = {}) {
  const bookId = new ObjectId(), orderId = new ObjectId(), userId = new ObjectId(), returnId = new ObjectId();
  const item = { bookId, title: 'Fixture', price: 100, quantity: 2, format: ebook ? 'ebook' : 'print' };
  const records = {
    books: missingBook ? [] : [{ _id: bookId, bookType: ebook ? 'ebook' : 'new', stock: ebook ? 0 : 3 }],
    orders: [{ _id: orderId, userId, status: 'pending', paymentMethod: 'cod', paymentStatus: 'unpaid',
      stockDeducted: true, restocked: false, items: [item], statusHistory: [], total: 200, shippingFee: 0, discount: 0 }],
    return_requests: [{ _id: returnId, orderId, userId, status: 'approved', type: 'refund',
      items: [item], statusHistory: [], restocked: false }],
  };
  let writes = 0;
  const matches = (doc, query) => Object.entries(query).every(([key, value]) => String(doc[key]) === String(value));
  const db = {
    admin: () => ({ command: async () => ({ setName: 'isolated-fixture' }) }),
    collection: (name) => ({
      findOne: async (query) => records[name].find((doc) => matches(doc, query)) ?? null,
      updateOne: async (query, update) => {
        const doc = records[name].find((row) => matches(row, query));
        if (!doc) return { modifiedCount: 0 };
        writes++;
        Object.assign(doc, update.$set);
        for (const [key, amount] of Object.entries(update.$inc ?? {})) doc[key] += amount;
        for (const [key, value] of Object.entries(update.$push ?? {})) (doc[key] ??= []).push(value);
        return { modifiedCount: 1 };
      },
    }),
  };
  let ended = false;
  const client = { startSession: () => ({
    // Snapshot rollback models the business callback only; real MongoDB transactions
    // remain covered by the opt-in replica-set integration suite.
    async withTransaction(work) {
      const snapshot = Object.fromEntries(Object.entries(records).map(([name, rows]) => [name,
        rows.map((row) => ({ ...row, items: row.items?.map((item) => ({ ...item })), statusHistory: [...(row.statusHistory ?? [])] })),
      ]));
      try { return await work(); } catch (error) { Object.assign(records, snapshot); throw error; }
    },
    async endSession() { ended = true; },
  }) };
  return { db, client, records, orderId: String(orderId), returnId: String(returnId),
    get writes() { return writes; }, get ended() { return ended; } };
}

test('Order status: cancellation returns physical stock once and replay is idempotent', async () => {
  const f = fixture();
  const cancel = () => transition(f.db, f.client, 'orders', f.orderId, { status: 'cancelled', note: 'Customer request', restock: true });
  await cancel(); await cancel();
  assert.equal(f.records.books[0].stock, 5);
  assert.equal(f.records.orders[0].statusHistory.length, 1);
  assert.equal(f.records.orders[0].restocked, true);
  assert.equal(f.ended, true);
});
test('Order status: ebook cancellation never increments physical inventory', async () => {
  const f = fixture({ ebook: true });
  await transition(f.db, f.client, 'orders', f.orderId, { status: 'cancelled', note: 'Fixture', restock: true });
  assert.equal(f.records.books[0].stock, 0);
});
test('Order status: invalid, demo and ownerless transitions cannot write', async () => {
  for (const overrides of [{}, { isDemo: true }, { userId: null }]) {
    const f = fixture(); Object.assign(f.records.orders[0], overrides);
    await assert.rejects(transition(f.db, f.client, 'orders', f.orderId, {
      status: Object.keys(overrides).length ? 'confirmed' : 'delivered',
    }), (error) => error.status === 409);
    assert.equal(f.writes, 0);
  }
});
test('Order status: missing books abort cancellation without changing order status', async () => {
  const f = fixture({ missingBook: true });
  await assert.rejects(transition(f.db, f.client, 'orders', f.orderId, { status: 'cancelled', note: 'Fixture', restock: true }), (e) => e.status === 409);
  assert.equal(f.records.orders[0].status, 'pending');
});
test('Order status: COD delivery records paid and ends the session', async () => {
  const f = fixture(); f.records.orders[0].status = 'shipping';
  await transition(f.db, f.client, 'orders', f.orderId, { status: 'delivered' });
  assert.equal(f.records.orders[0].paymentStatus, 'paid');
  assert.equal(f.ended, true);
});
test('Returns: full receipt/restock and full refund update the linked order once', async () => {
  const f = fixture(); Object.assign(f.records.orders[0], { status: 'delivered', paymentStatus: 'paid' });
  await transition(f.db, f.client, 'returns', f.returnId, { status: 'received', restock: true });
  assert.equal(f.records.books[0].stock, 5);
  assert.equal(f.records.orders[0].restocked, true);
  const refund = () => transition(f.db, f.client, 'returns', f.returnId, { status: 'refunded', refundAmount: 200 });
  await refund(); await refund();
  assert.equal(f.records.orders[0].paymentStatus, 'refunded');
  assert.equal(f.records.orders[0].status, 'returned');
  assert.equal(f.records.return_requests[0].statusHistory.length, 2);
});
test('Returns: partial quantities and unapproved shipping allocation cannot write', async () => {
  for (const partial of [true, false]) {
    const f = fixture(); Object.assign(f.records.orders[0], { status: 'delivered', paymentStatus: 'paid' });
    f.records.return_requests[0].status = 'received';
    if (partial) f.records.return_requests[0].items = [{ ...f.records.return_requests[0].items[0], quantity: 1 }];
    else f.records.orders[0].shippingFee = 20;
    await assert.rejects(transition(f.db, f.client, 'returns', f.returnId, { status: 'refunded', refundAmount: partial ? 100 : 200 }), (e) => e.status === 409);
    assert.equal(f.writes, 0);
    assert.equal(f.records.orders[0].paymentStatus, 'paid');
  }
});
test('Status mutations fail before writes without a transactional deployment', async () => {
  const f = fixture();
  await assert.rejects(transition(f.db, null, 'orders', f.orderId, { status: 'confirmed' }), (e) => e.status === 503);
  f.db.admin = () => ({ command: async () => ({}) });
  await assert.rejects(transition(f.db, f.client, 'orders', f.orderId, { status: 'confirmed' }), (e) => e.status === 503);
  assert.equal(f.writes, 0);
});

test('Status payload cannot smuggle paymentStatus or malformed amounts into a transition', async () => {
  const f = fixture();
  for (const body of [{ status: 'cancelled', paymentStatus: 'paid' }, { status: 'confirmed', note: {} },
    { status: 'refunded', refundAmount: '200' }, { status: 'refunded', refundAmount: null }]) {
    await assert.rejects(transition(f.db, f.client, 'orders', f.orderId, body), (e) => e.status === 400);
  }
  assert.equal(f.writes, 0);
});

test('Restock refuses unsafe integer overflow instead of corrupting inventory', async () => {
  const f = fixture();
  f.records.books[0].stock = Number.MAX_SAFE_INTEGER;
  await assert.rejects(transition(f.db, f.client, 'orders', f.orderId,
    { status: 'cancelled', note: 'Fixture', restock: true }), (e) => e.status === 409);
  assert.equal(f.writes, 0);
  assert.equal(f.records.books[0].stock, Number.MAX_SAFE_INTEGER);
});
