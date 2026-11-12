// Chạy: node --test routes/customer-pricing.test.js   (trong thư mục my-server)
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTotals, voucherProblem, voucherKind, publicVoucher } = require('./customer-pricing');

const print = (bookId, price, quantity = 1) => ({ bookId, price, quantity, ebook: false });
const ebook = (bookId, price) => ({ bookId, price, quantity: 1, ebook: true });

test('phí ship: dưới 500k tính 30k, từ 500k freeship, giao nhanh luôn 45k', () => {
  assert.equal(computeTotals([print('a', 499000)]).shippingFee, 30000);
  assert.equal(computeTotals([print('a', 250000, 2)]).shippingFee, 0);
  assert.equal(computeTotals([print('a', 600000)], { method: 'express' }).shippingFee, 45000);
});

test('đơn chỉ có ebook không có phí ship', () => {
  const t = computeTotals([ebook('e', 65000)], { method: 'express' });
  assert.equal(t.shippingFee, 0); assert.equal(t.shippingMethod, null); assert.equal(t.total, 65000);
});

test('mã phần trăm có trần giảm tối đa', () => {
  const t = computeTotals([print('a', 400000)], { voucher: { type: 'percentage', value: 20, maxDiscount: 50000 } });
  assert.equal(t.discount, 50000); assert.equal(t.total, 400000 - 50000 + 30000);
});

test('mã cố định không vượt quá tiền hàng và cần đơn tối thiểu', () => {
  assert.equal(computeTotals([print('a', 30000)], { voucher: { type: 'fixed', value: 50000 } }).discount, 30000);
  const t = computeTotals([print('a', 100000)], { voucher: { type: 'fixed', value: 50000, minOrderValue: 300000 } });
  assert.equal(t.discount, 0); assert.match(t.voucherError, /300\.000/);
});

test('mã freeship chỉ miễn phí giao tiêu chuẩn', () => {
  const v = { type: 'free_shipping' };
  assert.equal(computeTotals([print('a', 100000)], { voucher: v }).shippingFee, 0);
  assert.equal(computeTotals([print('a', 100000)], { voucher: v, method: 'express' }).shippingFee, 45000);
});

test('client combo definitions and freeship cannot create a server discount', () => {
  const lines = [print('a', 120000), print('b', 95000)];
  const t = computeTotals(lines, { combos: [{ bookIds: ['a', 'b'], freeship: true }] });
  assert.equal(t.comboDiscount, 0);
  assert.equal(t.shippingFee, 30000);
  assert.equal(computeTotals(lines, { combos: [{ bookIds: ['a', 'c'] }] }).comboDiscount, 0);
});

test('kiểm tra mã: hết hạn, chưa tới ngày, hết lượt, sai loại', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  assert.equal(voucherProblem({ type: 'fixed', value: 1000, status: 'active' }, now), null);
  assert.match(voucherProblem({ type: 'fixed', value: 1000, endAt: '2026-01-01' }, now), /hết hạn/);
  assert.match(voucherProblem({ type: 'fixed', value: 1000, startAt: '2027-01-01' }, now), /chưa đến/);
  assert.match(voucherProblem({ type: 'fixed', value: 1000, usageLimit: 5, usedCount: 5 }, now), /hết lượt/);
  assert.match(voucherProblem({ type: 'fixed', value: 1000, perUserLimit: 1 }, now, 1), /hết lượt/);
  assert.ok(voucherProblem({ type: 'bogus' }, now));
  assert.equal(voucherKind('PERCENT'), 'percent');
});

test('publicVoucher không trả usageLimit/usedCount', () => {
  const v = publicVoucher({ code: 'abc', type: 'percent', value: 10, usageLimit: 9, usedCount: 2 });
  assert.equal(v.code, 'ABC'); assert.equal(v.description, 'giảm 10%'); assert.equal('usedCount' in v, false);
});


// Isolated HTTP regression tests. No MongoClient, environment variables, or disk
// writes. MVCC fixture retries callbacks on commit conflicts like withTransaction;
// this validates business behavior, not the MongoDB storage engine.
const express = require('express');
const { ObjectId, BSON } = require('mongodb');
const { digest: tokenDigest } = require('../middleware/customer-auth');
const clone = (value) => BSON.deserialize(BSON.serialize({ value })).value;
const equal = (a, b) => a instanceof Date || b instanceof Date ? +a === +b : String(a) === String(b);
function matches(doc, query) {
  const expression = (value) => {
    if (typeof value === 'string' && value.startsWith('$')) return doc[value.slice(1)];
    if (value && typeof value === 'object' && '$ifNull' in value) return expression(value.$ifNull[0]) ?? expression(value.$ifNull[1]);
    return value;
  };
  return Object.entries(query).every(([key, value]) => {
    const actual = key.split('.').reduce((row, field) => row?.[field], doc);
    if (key === '$expr') {
      if ('$lte' in value) return expression(value.$lte[0]) <= expression(value.$lte[1]);
      throw new Error('Unsupported fixture expression');
    }
    if (key === '$or') return value.some((branch) => matches(doc, branch));
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([op, operand]) => {
        if (op === '$in') return operand.some((item) => equal(actual, item));
        if (op === '$nin') return !operand.some((item) => equal(actual, item));
        if (op === '$ne') return !equal(actual, operand);
        if (op === '$exists') return Object.hasOwn(doc, key) === operand;
        if (op === '$gt') return actual > operand;
        if (op === '$regex') return new RegExp(operand, value.$options).test(actual || '');
        if (op === '$options') return true;
        throw new Error('Unsupported fixture query ' + op);
      });
    }
    return equal(actual, value);
  });
}
async function checkoutFixture(t, { used = false, ebook = false, stock = 5, quota = 10, perUser = 10 } = {}) {
  const userId = new ObjectId(), accountId = new ObjectId(), secondUser = new ObjectId(), secondAccount = new ObjectId();
  const bookId = new ObjectId(), addressId = new ObjectId(), secondAddress = new ObjectId(), voucherId = new ObjectId();
  const token = 'a'.repeat(64), otherToken = 'b'.repeat(64);
  const book = { _id: bookId, title: 'Fixture', bookType: ebook ? 'ebook' : used ? 'used' : 'new', status: 'active', price: 100000, stock };
  let records = {
    users: [{ _id: userId, accountId, fullName: 'Fixture' }, { _id: secondUser, accountId: secondAccount, fullName: 'Other' }],
    accounts: [{ _id: accountId, roleCode: 'CUSTOMER', status: 'active', email: 'a@example.invalid' },
      { _id: secondAccount, roleCode: 'CUSTOMER', status: 'active', email: 'b@example.invalid' }],
    customer_sessions: [{ tokenHash: tokenDigest(token), accountId, userId, expiresAt: new Date('2099-01-01') },
      { tokenHash: tokenDigest(otherToken), accountId: secondAccount, userId: secondUser, expiresAt: new Date('2099-01-01') }],
    books: [book], old_books: used ? [clone(book)] : [], authors: [], orders: [], notifications: [], personalBooks: [], settings: [], inventory_logs: [], 'fs.files': [],
    addresses: [{ _id: addressId, userId, recipientName: 'Fixture', street: 'Street' },
      { _id: secondAddress, userId: secondUser, recipientName: 'Other', street: 'Other street' }],
    vouchers: [{ _id: voucherId, code: 'QA10', type: 'percent', value: 10, usedCount: 0, usageLimit: quota, perUserLimit: perUser, status: 'active' }],
  };
  let version = 0, retries = 0, ended = 0, fail = null, duplicateAfterCommit = false, gate = null, atomicWrites = false, updateHook = null;
  const db = {
    listCollections: () => ({ toArray: async () => Object.keys(records).map((name) => ({ name })) }),
    admin: () => ({ command: async () => ({ setName: 'memory-fixture' }) }),
    client: { startSession() {
      const session = {
        async withTransaction(work) {
          for (let attempt = 0; attempt < 30; attempt++) {
            const snapshotVersion = version;
            session.records = clone(records);
            const activeGate = gate;
            if (activeGate) {
              if (++activeGate.waiting === 2) { gate = null; activeGate.resume(); }
              await activeGate.promise;
            }
            const result = await work();
            if (snapshotVersion !== version) { retries++; continue; }
            records = session.records; version++;
            if (duplicateAfterCommit) { duplicateAfterCommit = false; throw Object.assign(new Error('Duplicate key'), { code: 11000 }); }
            return result;
          }
          throw new Error('Fixture retry limit');
        },
        async endSession() { ended++; },
      };
      return session;
    } },
    collection(name) {
      const rows = (opts) => {
        assert.ok(Object.hasOwn(records, name), 'No implicit collections: ' + name);
        return (opts?.session?.records ?? records)[name];
      };
      const maybeFail = (op) => {
        if (fail === name + '.' + op) { fail = null; throw new Error('Injected ' + name + '.' + op); }
      };
      return {
        async findOne(query, opts) { return clone(rows(opts).find((doc) => matches(doc, query)) ?? null); },
        find(query = {}, opts) { return { project() { return this; }, sort() { return this; }, limit() { return this; },
          toArray: async () => { maybeFail('find'); return clone(rows(opts).filter((doc) => matches(doc, query))); } }; },
        async countDocuments(query, opts) { return rows(opts).filter((doc) => matches(doc, query)).length; },
        async insertOne(doc, opts) {
          maybeFail('insertOne'); assert.ok(opts?.session, 'Mutation must carry session');
          if (rows(opts).some((row) => equal(row._id, doc._id) || (name === 'personalBooks' && equal(row.userId, doc.userId) && equal(row.bookId, doc.bookId))))
            throw Object.assign(new Error('Duplicate'), { code: 11000 });
          const insertedId = doc._id || new ObjectId(); rows(opts).push(clone({ ...doc, _id: insertedId })); return { insertedId };
        },
        async updateOne(query, update, opts) {
          if (updateHook?.name === name) { const work = updateHook.work; updateHook = null; await work(); }
          maybeFail('updateOne'); assert.ok(opts?.session || atomicWrites, 'Mutation must carry session or be explicitly atomic');
          const doc = rows(opts).find((row) => matches(row, query));
          if (!doc) return { matchedCount: 0, modifiedCount: 0 };
          Object.assign(doc, clone(update.$set || {}));
          for (const [key, amount] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + amount;
          for (const [key, value] of Object.entries(update.$push || {})) (doc[key] ??= []).push(clone(value));
          if (!opts?.session) version++;
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };
  const app = express(); app.use(express.json());
  app.use('/api', require('./customer')(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (path, body, { key = 'fixture-order-key-0001', other = false, method = 'POST', authenticated = true } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer ' + (other ? otherToken : token) } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const body = { items: [{ bookId: String(bookId), quantity: 1 }], addressId: String(addressId), paymentMethod: ebook ? 'momo' : 'cod', voucherCode: 'QA10' };
  return { db, body, request, bookId, secondAddress, get records() { return records; }, get retries() { return retries; },
    get ended() { return ended; }, failNext(op) { fail = op; }, duplicateNextCommit() { duplicateAfterCommit = true; },
    allowAtomicWrites() { atomicWrites = true; },
    beforeNextUpdate(name, work) { updateHook = { name, work }; },
    concurrentNext() { gate = { waiting: 0 }; gate.promise = new Promise((resolve) => { gate.resume = resolve; }); } };
}

async function freeEbookFixture(t) {
  const f = await checkoutFixture(t, { ebook: true });
  const book = f.records.books[0]; book.price = 0; book.ebookFormat = 'pdf'; book.ebookFileId = new ObjectId();
  f.records['fs.files'].push({ _id: book.ebookFileId, length: 100, metadata: { bookId: book._id, verified: true } });
  return { f, book, claim: (body = {}, options = {}) => f.request('/account/ebooks/' + f.bookId, body, { method: 'PUT', ...options }) };
}

test('Free Ebook claim is explicit, idempotent, owns only the caller and never creates payment/order data', async t => {
  const { f, book, claim } = await freeEbookFixture(t), business = clone(f.records);
  f.allowAtomicWrites(); // Existing progress API uses an atomic revision predicate.
  const created = await claim(); assert.equal(created.status, 201); assert.equal(created.body.acquisitionType, 'free');
  assert.equal(created.body.owned, true); assert.equal(f.records.personalBooks.length, 1);
  const row = f.records.personalBooks[0]; assert.equal(String(row.userId), String(f.records.users[0]._id));
  assert.equal(row.acquisitionPrice, 0); assert.equal(row.orderId, undefined); assert.equal(row.paidAt, undefined);
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/progress', null, { method: 'GET', other: true })).status, 404);
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/progress', { page: 4 }, { method: 'PUT' })).status, 200);
  const beforeReplay = clone(f.records.personalBooks); assert.deepEqual((await claim()).body, created.body);
  assert.deepEqual(f.records.personalBooks, beforeReplay, 'Retry must not overwrite reading progress');
  const shelf = await f.request('/account/ebooks', null, { method: 'GET' });
  assert.equal(shelf.body.length, 1); assert.equal(shelf.body[0].format, 'PDF'); assert.equal(shelf.body[0].acquisitionType, 'free');
  for (const name of ['orders', 'vouchers', 'notifications', 'books', 'old_books']) assert.deepEqual(f.records[name], business[name]);
  f.records.books[0].price = 50000; // A later price change does not revoke a legitimately acquired copy.
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/progress', null, { method: 'GET' })).status, 200);
  assert.equal((await claim({}, { other: true })).status, 403);
});

test('Free Ebook simultaneous requests and a lost commit acknowledgement create one entitlement', async t => {
  const { f, claim } = await freeEbookFixture(t); f.concurrentNext();
  const responses = await Promise.all([claim(), claim()]); assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
  assert.equal(f.records.personalBooks.length, 1); assert(f.retries > 0);
  f.records.personalBooks.length = 0; f.duplicateNextCommit();
  const recovered = await claim(); assert.equal(recovered.status, 200); assert.equal(f.records.personalBooks.length, 1);
  assert.equal(f.records.orders.length, 0);
});

test('Free Ebook rejects anonymous users, client payment/owner claims, paid/nonactive/demo books and unverified files', async t => {
  const { f, book, claim } = await freeEbookFixture(t);
  assert.equal((await claim({}, { authenticated: false })).status, 401);
  for (const body of [{ price: 0 }, { userId: String(f.records.users[1]._id) }, { acquisitionType: 'free' }, { paymentStatus: 'paid' }, []])
    assert.equal((await claim(body)).status, 400);
  assert.equal((await f.request('/account/ebooks/invalid', {}, { method: 'PUT' })).status, 400);
  for (const [patch, status] of [[{ price: 1 }, 403], [{ price: '0' }, 403], [{ bookType: 'new' }, 404],
    [{ status: 'hidden' }, 404], [{ isDemo: true }, 404], [{ ebookFileId: null }, 409]]) {
    const old = clone(book); Object.assign(book, patch); const before = clone(f.records);
    assert.equal((await claim()).status, status); assert.deepEqual(f.records, before);
    for (const key of Object.keys(book)) delete book[key]; Object.assign(book, old);
  }
  f.records['fs.files'][0].metadata.verified = false; assert.equal((await claim()).status, 409);
  assert.equal(f.records.personalBooks.length, 0);
});

test('Free Ebook cannot reclaim revoked/refunded rights, rewrite demo/history or trust legacy free labels', async t => {
  const { f, claim } = await freeEbookFixture(t); assert.equal((await claim()).status, 201);
  f.records.personalBooks[0].accessRevokedAt = new Date();
  const revoked = clone(f.records); assert.equal((await claim()).status, 403); assert.deepEqual(f.records, revoked);
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/progress', null, { method: 'GET' })).status, 403);
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/progress', { page: 9 }, { method: 'PUT' })).status, 403);
  assert.deepEqual((await f.request('/account/ebooks', null, { method: 'GET' })).body, []);
  for (const fields of [{ acquisitionType: 'free', acquisitionPrice: 0, createdAt: new Date() }, { isDemo: true }]) {
    f.records.personalBooks.splice(0, 1, { _id: new ObjectId(), userId: f.records.users[0]._id, bookId: f.bookId, ...fields });
    const before = clone(f.records); assert.equal((await claim()).status, 409); assert.deepEqual(f.records, before);
  }
});

test('Free Ebook rollback/server errors and standalone deployment do not leave ownership behind', async t => {
  const { f, claim } = await freeEbookFixture(t); f.failNext('personalBooks.insertOne');
  const before = clone(f.records); assert.equal((await claim()).status, 500); assert.deepEqual(f.records, before);
  f.db.admin = () => ({ command: async () => ({}) });
  assert.equal((await claim()).status, 503); assert.deepEqual(f.records, before);
});

test('Settings shipping is authoritative for quotes/orders, replay stays stable and invalid config cannot write', async (t) => {
  const f = await checkoutFixture(t);
  f.records.settings.push({ _id: new ObjectId(), shipping: { standardFee: 18000, freeShippingThreshold: 200000 }, privatePaymentKey: 'not-public' });
  const quoted = await f.request('/vouchers/apply', { code: 'QA10', items: f.body.items });
  assert.equal(quoted.status, 200);
  const created = await f.request('/orders', f.body);
  assert.equal(created.status, 201); assert.equal(created.body.shippingFee, 18000);
  f.records.settings[0].shipping.standardFee = 22000;
  const replay = await f.request('/orders', f.body);
  assert.equal(replay.status, 200); assert.equal(replay.body.shippingFee, 18000);
  const threshold = await f.request('/orders', { ...f.body, items: [{ ...f.body.items[0], quantity: 2 }] }, { key: 'settings-order-threshold-1' });
  assert.equal(threshold.status, 201); assert.equal(threshold.body.shippingFee, 0);
  const express = await f.request('/orders', { ...f.body, shippingMethod: 'express' }, { key: 'settings-order-express-1' });
  assert.equal(express.body.shippingFee, 45000);
  f.records.settings[0].shipping.standardFee = -1;
  const before = clone(f.records);
  assert.equal((await f.request('/orders', f.body, { key: 'settings-invalid-order-1' })).status, 503);
  assert.deepEqual(f.records, before);
  assert.equal((await f.request('/vouchers/apply', { code: 'QA10', items: f.body.items })).status, 503);
});

test('Checkout rolls back stock, orders, quota and notification on failures at each write', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  for (const operation of ['vouchers.updateOne', 'old_books.updateOne', 'books.updateOne', 'orders.insertOne', 'notifications.insertOne']) {
    const before = clone(f.records);
    f.failNext(operation);
    assert.equal((await f.request('/orders', f.body)).status, 500, operation);
    assert.deepEqual(f.records, before, operation + ' must roll back all collections');
  }
  const response = await f.request('/orders', f.body);
  assert.equal(response.status, 201);
  assert.equal(f.records.books[0].stock, 4);
  assert.equal(f.records.old_books[0].stock, 4);
  assert.equal(f.records.vouchers[0].usedCount, 1);
  assert.equal(f.records.orders.length, 1);
  assert.equal(f.records.notifications.length, 1);
});

test('Checkout same-key concurrency/replay commits one order; changed payload conflicts; cancellation replays safely', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  f.concurrentNext();
  const responses = await Promise.all([f.request('/orders', f.body), f.request('/orders', f.body)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(responses[0].body._id, responses[1].body._id);
  assert.equal(f.records.orders.length, 1);
  assert.equal(f.records.books[0].stock, 4);
  assert.equal(f.records.old_books[0].stock, 4);
  assert.equal(f.records.vouchers[0].usedCount, 1);
  assert.equal((await f.request('/orders', { ...f.body, note: 'changed' })).status, 409);
  const id = responses[0].body._id;
  const cancel = () => f.request('/account/orders/' + id + '/cancel', {}, { method: 'PUT' });
  f.concurrentNext();
  assert.deepEqual((await Promise.all([cancel(), cancel()])).map((r) => r.status), [200, 200]);
  assert.equal(f.records.books[0].stock, 5);
  assert.equal(f.records.old_books[0].stock, 5);
  assert.equal(f.records.vouchers[0].usedCount, 0);
  assert.equal(f.records.orders[0].statusHistory.length, 2);
  assert.equal((await f.request('/orders', f.body)).body.status, 'cancelled');
  assert.ok(f.retries > 0, 'MVCC conflicts actually exercise callback retries');
  assert.ok(f.ended >= 5);
});

test('Checkout resolves duplicate-key commit response as replay without deducting again', async (t) => {
  const f = await checkoutFixture(t);
  f.duplicateNextCommit();
  assert.equal((await f.request('/orders', f.body)).status, 200);
  assert.equal(f.records.orders.length, 1);
  assert.equal(f.records.books[0].stock, 4);
  assert.equal(f.records.vouchers[0].usedCount, 1);
});

test('Concurrent customers cannot exceed voucher total quota', async (t) => {
  const f = await checkoutFixture(t, { quota: 1 });
  f.concurrentNext();
  const results = await Promise.all([f.request('/orders', f.body), f.request('/orders',
    { ...f.body, addressId: String(f.secondAddress) }, { other: true })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(f.records.orders.length, 1);
  assert.equal(f.records.vouchers[0].usedCount, 1);
  assert.equal(f.records.books[0].stock, 4);
});
test('Concurrent different keys cannot exceed per-customer quota; cancellation releases it', async (t) => {
  const f = await checkoutFixture(t, { perUser: 1 });
  f.concurrentNext();
  const results = await Promise.all([f.request('/orders', f.body), f.request('/orders', f.body, { key: 'fixture-order-key-0002' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(f.records.vouchers[0].usedCount, 1);
  const winner = results.find((r) => r.status === 201).body;
  assert.equal((await f.request('/account/orders/' + winner._id + '/cancel', {}, { method: 'PUT' })).status, 200);
  assert.equal((await f.request('/orders', f.body, { key: 'fixture-order-key-0003' })).status, 201);
});
test('Concurrent checkout cannot oversell the last physical/used copy', async (t) => {
  const f = await checkoutFixture(t, { used: true, stock: 1 });
  f.concurrentNext();
  const results = await Promise.all([f.request('/orders', f.body), f.request('/orders', f.body, { key: 'fixture-order-key-0002' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(f.records.books[0].stock, 0); assert.equal(f.records.old_books[0].stock, 0);
  assert.equal(f.records.vouchers[0].usedCount, 1);
});
test('Cancellation rollback keeps order, both stocks and quota unchanged', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const created = await f.request('/orders', f.body);
  for (const operation of ['old_books.updateOne', 'books.updateOne', 'vouchers.updateOne', 'orders.updateOne', 'notifications.insertOne']) {
    const before = clone(f.records); f.failNext(operation);
    assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT' })).status, 500);
    assert.deepEqual(f.records, before);
  }
});
test('Ebook checkout/cancel never changes physical stock or grants a shelf item', async (t) => {
  const f = await checkoutFixture(t, { ebook: true, stock: 0 });
  const created = await f.request('/orders', f.body);
  assert.equal(created.status, 201); assert.equal(f.records.books[0].stock, 0);
  const before = clone(f.records);
  const confirmed = await f.request('/orders/' + created.body._id + '/confirm-payment', {});
  assert.equal(confirmed.status, 409); assert.equal(confirmed.body.code, 'PAYMENT_VERIFICATION_UNAVAILABLE');
  assert.deepEqual(f.records, before); assert.equal(f.records.personalBooks.length, 0);
  assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT' })).status, 200);
  assert.equal(f.records.books[0].stock, 0);
});
test('Checkout rejects anonymous, absent key, demo, forged promotion, invalid quantity and mismatched used stock without writes', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const before = clone(f.records);
  assert.equal((await f.request('/orders', f.body, { authenticated: false })).status, 401);
  assert.equal((await f.request('/orders', f.body, { key: null })).status, 400);
  assert.equal((await f.request('/orders', { ...f.body, combos: [{ bookIds: [String(f.bookId)], freeship: true }] })).status, 409);
  assert.equal((await f.request('/vouchers/apply', { code: 'QA10', items: f.body.items, combos: [{ freeship: true }] })).status, 409);
  assert.equal((await f.request('/orders', { ...f.body, freeship: true })).status, 400);
  assert.equal((await f.request('/orders', { ...f.body, items: [{ bookId: String(f.bookId), quantity: 0 }] })).status, 400);
  assert.deepEqual(f.records, before);
  f.records.old_books[0].stock = 3;
  const mismatch = clone(f.records);
  assert.equal((await f.request('/orders', f.body)).status, 409);
  assert.deepEqual(f.records, mismatch);
  f.records.old_books[0].stock = 5; f.records.books[0].isDemo = true;
  const demo = clone(f.records);
  assert.equal((await f.request('/orders', f.body)).status, 409); assert.deepEqual(f.records, demo);
});
test('Demo orders stay readable but cancellation/payment and cross-customer access cannot mutate them', async (t) => {
  const f = await checkoutFixture(t);
  const created = await f.request('/orders', f.body);
  f.records.orders[0].isDemo = true;
  const before = clone(f.records);
  assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT' })).status, 409);
  assert.equal((await f.request('/orders/' + created.body._id + '/confirm-payment', {})).status, 409);
  assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT', other: true })).status, 404);
  assert.deepEqual(f.records, before);
});
test('Transaction capability failure performs no checkout writes', async (t) => {
  const f = await checkoutFixture(t);
  const before = clone(f.records);
  f.db.admin = () => ({ command: async () => ({}) });
  assert.equal((await f.request('/orders', f.body)).status, 503);
  assert.deepEqual(f.records, before);
});


test('Admin used-book creation and stock editing keep books/old_books atomic', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const categoryId = new ObjectId();
  f.records.categories = [{ _id: categoryId, name: 'Fixture' }];
  f.records.books[0].categoryId = categoryId;
  const router = require('./admin-books')(() => f.db);
  const call = async (method, path, body, id) => {
    const handler = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
    let status = 200, result;
    const res = { status(code) { status = code; return this; }, json(value) { result = value; return this; } };
    await handler({ body, params: { id } }, res);
    return { status, body: result };
  };
  const payload = { title: 'Used fixture', categoryId: String(categoryId), authorId: null, authorName: '',
    bookType: 'used', condition: 'Good', stock: 3, price: 100000, status: 'active', revision: null };
  let before = clone(f.records);
  f.failNext('books.insertOne');
  assert.equal((await call('post', '/books', payload)).status, 500);
  assert.deepEqual(f.records, before);
  const created = await call('post', '/books', payload);
  assert.equal(created.status, 201);
  const id = String(created.body._id);
  assert.equal(f.records.old_books.find((book) => String(book._id) === id).stock, 3);
  const edit = { ...payload, stock: 8 };
  before = clone(f.records);
  f.failNext('books.updateOne');
  assert.equal((await call('put', '/books/:id', edit, String(f.bookId))).status, 500);
  assert.deepEqual(f.records, before);
  assert.equal((await call('put', '/books/:id', edit, String(f.bookId))).status, 200);
  assert.equal(f.records.books[0].stock, 8);
  assert.equal(f.records.old_books[0].stock, 8);
});
test('Admin cancellation releases the same voucher reservation and used stock only once', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const created = await f.request('/orders', f.body);
  const transition = require('../middleware/admin-safe-status');
  const cancel = () => transition(f.db, f.db.client, 'orders', created.body._id, { status: 'cancelled', note: 'Fixture' });
  f.concurrentNext();
  await Promise.all([cancel(), cancel()]);
  assert.equal(f.records.books[0].stock, 5); assert.equal(f.records.old_books[0].stock, 5);
  assert.equal(f.records.vouchers[0].usedCount, 0);
  assert.equal(f.records.orders[0].statusHistory.length, 2);
});


test('Voucher quota checks cannot be bypassed by an undercounted counter or a renamed code', async (t) => {
  const f = await checkoutFixture(t, { quota: 1, perUser: 1 });
  const created = await f.request('/orders', f.body);
  assert.equal(created.status, 201);
  f.records.vouchers[0].usedCount = 0;
  const before = clone(f.records);
  assert.equal((await f.request('/orders', f.body, { key: 'fixture-order-key-0002' })).status, 409);
  assert.deepEqual(f.records, before);
  f.records.vouchers[0].code = 'RENAMED';
  const renamed = clone(f.records);
  assert.equal((await f.request('/orders', { ...f.body, voucherCode: 'RENAMED' }, { key: 'fixture-order-key-0003' })).status, 409);
  assert.deepEqual(f.records, renamed);
});


async function adminHandler(db, module, method, routePath, id, body, extra = {}) {
  const router = require('./' + module)(() => db);
  const handler = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method]).route.stack.at(-1).handle;
  let status = 200, result;
  const res = { status(code) { status = code; return this; }, json(value) { result = value; return this; } };
  await handler({ params: { id }, body, ...extra }, res);
  return { status, body: result };
}

test('Inventory receipt commits stock/mirror/log once, rejects stale/invalid requests and rolls back log failures', async t => {
  const f = await checkoutFixture(t, { used: true });
  const actor = String(new ObjectId()), initial = new Date('2026-01-01');
  f.records.books[0].updatedAt = initial; f.records.old_books[0].updatedAt = initial;
  const call = (body, key = 'inventory-fixture-key-001') => adminHandler(f.db, 'admin-books', 'post', '/books/inventory/stock-in', null, body,
    { admin: { _id: actor, fullName: 'Fixture admin' }, get: () => key });
  const body = { bookId: String(f.bookId), quantity: 2, revision: initial.toISOString(), note: 'Received stock' };
  const before = clone(f.records);
  f.failNext('inventory_logs.insertOne'); assert.equal((await call(body)).status, 500); assert.deepEqual(f.records, before);
  f.concurrentNext();
  const responses = await Promise.all([call(body), call(body)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
  assert.equal(f.records.books[0].stock, 7); assert.equal(f.records.old_books[0].stock, 7);
  assert.equal(f.records.inventory_logs.length, 1);
  const receipt = f.records.inventory_logs[0];
  assert.equal(receipt.stockBefore, 5); assert.equal(receipt.stockAfter, 7); assert.equal(String(receipt.actorId), actor);
  assert.equal((await call({ ...body, quantity: 3 })).status, 409);
  assert.equal((await call(body, 'inventory-fixture-key-002')).status, 409);
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.equal((await call({ ...body, quantity })).status, 400);
  f.records.books[0].bookType = 'ebook';
  assert.equal((await call({ ...body, revision: f.records.books[0].updatedAt.toISOString() }, 'inventory-fixture-key-003')).status, 409);
});
function voucherEdit(code, revision = null) {
  return { code, name: 'Fixture', description: '', type: 'percent', value: 10,
    maxDiscount: 0, minOrder: 0, limit: 10, perCustomer: 1, start: '2020-01-01', end: '2099-12-31',
    categories: [], newOnly: false, suggest: false, paused: false, revision };
}
function configureVoucher(f) {
  Object.assign(f.records.vouchers[0], { startAt: new Date('2019-12-31T17:00:00Z'), endAt: new Date('2099-12-31T16:59:59.999Z') });
  f.allowAtomicWrites();
}
test('NEW-02 regression: stock 5 -> checkout 4 -> stale Admin form sending 5 must conflict', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const categoryId = new ObjectId(), revision = new Date('2027-01-01T00:00:00.000Z');
  f.records.categories = [{ _id: categoryId, name: 'Fixture' }];
  Object.assign(f.records.books[0], { categoryId, updatedAt: revision, description: 'Preserve me' });
  f.records.old_books[0].updatedAt = revision;
  const created = await f.request('/orders', f.body);
  assert.equal(created.status, 201);
  assert.equal(f.records.books[0].stock, 4);
  const afterCheckout = clone(f.records);
  const stale = await adminHandler(f.db, 'admin-books', 'put', '/books/:id', String(f.bookId), {
    title: 'Stale title', categoryId: String(categoryId), authorName: '', bookType: 'used',
    condition: 'Good', stock: 5, price: 100000, status: 'active', revision: revision.toISOString() });
  assert.equal(stale.status, 409);
  assert.deepEqual(f.records, afterCheckout, 'Conflict must not change any book fields');
  assert.ok(+f.records.books[0].updatedAt > +revision);
  assert.equal(+f.records.books[0].updatedAt, +f.records.old_books[0].updatedAt);
  const checkoutRevision = +f.records.books[0].updatedAt;
  assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT' })).status, 200);
  assert.equal(f.records.books[0].stock, 5);
  assert.equal(f.records.old_books[0].stock, 5);
  assert.ok(+f.records.books[0].updatedAt > checkoutRevision);
  assert.equal(f.records.books[0].description, 'Preserve me');
});
test('BUG-002 regression: Admin must not rename a used voucher linked only by legacy code', async (t) => {
  const f = await checkoutFixture(t, { quota: 10, perUser: 1 });
  configureVoucher(f);
  assert.equal((await f.request('/orders', f.body)).status, 201);
  delete f.records.orders[0].voucherId;
  const before = clone(f.records);
  const voucher = f.records.vouchers[0];
  const renamed = await adminHandler(f.db, 'admin-vouchers', 'put', '/vouchers/:id', String(voucher._id),
    voucherEdit('RENAMED', voucher.updatedAt?.toISOString() ?? null));
  assert.equal(renamed.status, 409);
  assert.deepEqual(f.records, before);
  assert.equal((await f.request('/orders', f.body, { key: 'legacy-second-key-0002' })).status, 409);
});
test('BUG-002 unused voucher may rename, but cancelled legacy history still protects code after quota returns to zero', async (t) => {
  const f = await checkoutFixture(t, { perUser: 1 }); configureVoucher(f);
  const voucherId = String(f.records.vouchers[0]._id);
  assert.equal((await adminHandler(f.db, 'admin-vouchers', 'put', '/vouchers/:id', voucherId, voucherEdit('RENAMED'))).status, 200);
  const created = await f.request('/orders', { ...f.body, voucherCode: 'RENAMED' });
  assert.equal(created.status, 201);
  delete f.records.orders[0].voucherId;
  assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT' })).status, 200);
  assert.equal(f.records.vouchers[0].usedCount, 0);
  const before = clone(f.records), voucher = f.records.vouchers[0];
  assert.equal((await adminHandler(f.db, 'admin-vouchers', 'put', '/vouchers/:id', voucherId,
    voucherEdit('AGAIN', voucher.updatedAt.toISOString()))).status, 409);
  assert.deepEqual(f.records, before);
});
async function ebookRefundFixture(t, verified) {
  const f = await checkoutFixture(t, { ebook: true, stock: 0 });
  const created = await f.request('/orders', { ...f.body, voucherCode: null });
  assert.equal(created.status, 201);
  const order = f.records.orders[0], at = new Date(Date.now() - 1000);
  Object.assign(order, { status: 'delivered', paymentStatus: 'paid' });
  if (verified) Object.assign(order, { paidAt: at,
    paymentVerification: { source: 'provider_webhook', provider: 'momo', transactionId: 'verified-fixture', verifiedAt: at } });
  const returnId = new ObjectId();
  f.records.return_requests = [{ _id: returnId, userId: order.userId, orderId: order._id,
    type: 'refund', status: 'received', items: clone(order.items), statusHistory: [], refundAmount: null }];
  f.records.personalBooks.push({ _id: new ObjectId(), userId: order.userId, bookId: f.bookId,
    orderCode: order.orderCode, page: 2, notes: [{ text: 'Preserve history' }] });
  return { f, returnId, refund: (amount = 100000) => require('../middleware/admin-safe-status')(
    f.db, f.db.client, 'returns', String(returnId), { status: 'refunded', refundAmount: amount }) };
}
test('REFUND regression: legacy paid without settlement evidence must require reconciliation, not refund', async (t) => {
  const { f, refund } = await ebookRefundFixture(t, false);
  const before = clone(f.records);
  await assert.rejects(refund(), (error) => error.status === 409 && /xác minh|reconcil|evidence/i.test(error.message));
  assert.deepEqual(f.records, before);
});
test('EBOOK regression: valid refund revokes backend read/write entitlement once and preserves history', async (t) => {
  const { f, refund } = await ebookRefundFixture(t, true);
  f.allowAtomicWrites();
  const path = '/account/ebooks/' + f.bookId + '/progress';
  assert.equal((await f.request(path, undefined, { method: 'GET' })).status, 200);
  assert.equal((await f.request(path, { page: 3, notes: f.records.personalBooks[0].notes }, { method: 'PUT' })).status, 200);
  assert.equal(f.records.personalBooks[0].page, 3);
  await refund();
  const progressAfterRefund = clone(f.records.personalBooks[0]);
  assert.equal((await f.request(path, undefined, { method: 'GET' })).status, 403);
  const denied = await f.request(path, { page: 99 }, { method: 'PUT' });
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.body, { message: 'Bạn không có quyền thực hiện thao tác này.' });
  assert.deepEqual(f.records.personalBooks[0], progressAfterRefund);
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/content', undefined, { method: 'GET' })).status, 403);
  const shelf = await f.request('/account/ebooks', undefined, { method: 'GET' });
  assert.equal(shelf.status, 200); assert.deepEqual(shelf.body, []);
  assert.equal(f.records.personalBooks.length, 1);
  assert.equal(f.records.personalBooks[0].notes[0].text, 'Preserve history');
  assert.ok(f.records.personalBooks[0].accessRevokedAt instanceof Date);
  const before = clone(f.records);
  await refund();
  assert.deepEqual(f.records, before);
  await assert.rejects(refund(50000), (error) => error.status === 409);
});

test('Customer HTTP hides forbidden details and keeps real GET/PUT server failures as 500', async (t) => {
  const { f } = await ebookRefundFixture(t, true);
  f.allowAtomicWrites();
  const path = '/account/ebooks/' + f.bookId + '/progress';
  const before = clone(f.records);
  f.beforeNextUpdate('personalBooks', async () => {
    throw Object.assign(new Error('PRIVATE: database credentials and internal query'), { status: 403 });
  });
  const forbidden = await f.request(path, { page: 99 }, { method: 'PUT' });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.body, { message: 'Bạn không có quyền thực hiện thao tác này.' });
  assert.deepEqual(f.records, before);
  for (const method of ['GET', 'PUT']) {
    f.failNext('personalBooks.find');
    const error = await f.request(path, { page: 99 }, { method });
    assert.equal(error.status, 500);
    assert.deepEqual(error.body, { message: 'Có lỗi xảy ra, vui lòng thử lại' });
    assert.deepEqual(f.records, before);
  }
});
test('EBOOK legacy without evidence is denied before refund and progress cannot self-authorize payment', async (t) => {
  const { f } = await ebookRefundFixture(t, false);
  const before = clone(f.records);
  const path = '/account/ebooks/' + f.bookId + '/progress';
  assert.equal((await f.request(path, undefined, { method: 'GET' })).status, 403);
  assert.equal((await f.request(path, { page: 3, paymentStatus: 'paid', paymentVerification: { source: 'provider_webhook' } }, { method: 'PUT' })).status, 403);
  assert.deepEqual(f.records, before);
});


test('Stock revisions remain monotonic with a frozen clock through checkout, cancel, bulk changes and stale edits', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const categoryId = new ObjectId(), fixed = Date.parse('2027-01-01T00:00:00Z'), originalNow = Date.now;
  f.records.categories = [{ _id: categoryId, name: 'Fixture' }];
  Object.assign(f.records.books[0], { categoryId, updatedAt: new Date(fixed) });
  f.records.old_books[0].updatedAt = new Date(fixed);
  Date.now = () => fixed;
  try {
    const created = await f.request('/orders', f.body);
    assert.equal(created.status, 201);
    const afterCheckout = +f.records.books[0].updatedAt;
    assert.equal(afterCheckout, fixed + 1);
    assert.equal((await f.request('/account/orders/' + created.body._id + '/cancel', {}, { method: 'PUT' })).status, 200);
    assert.equal(+f.records.books[0].updatedAt, afterCheckout + 1);
    assert.equal(+f.records.old_books[0].updatedAt, afterCheckout + 1);
    const bulk = await adminHandler(f.db, 'admin-books', 'patch', '/books/bulk', null, { ids: [String(f.bookId)], action: 'hide' });
    assert.equal(bulk.status, 200);
    assert.equal(+f.records.books[0].updatedAt, afterCheckout + 2);
    const stale = await adminHandler(f.db, 'admin-books', 'put', '/books/:id', String(f.bookId), {
      title: 'Stale', categoryId: String(categoryId), bookType: 'used', condition: 'Good',
      price: 100000, stock: 5, status: 'active', revision: new Date(afterCheckout).toISOString() });
    assert.equal(stale.status, 409);
  } finally { Date.now = originalNow; }
});
test('Checkout/cancel racing an Admin stock adjustment cannot overwrite a newer revision or desynchronize used stock', async (t) => {
  const f = await checkoutFixture(t, { used: true });
  const categoryId = new ObjectId();
  f.records.categories = [{ _id: categoryId, name: 'Fixture' }];
  Object.assign(f.records.books[0], { categoryId, updatedAt: new Date('2026-01-01') });
  const edit = (stock) => ({ title: 'Admin adjustment', categoryId: String(categoryId), bookType: 'used', condition: 'Good',
    stock, price: 100000, status: 'active', revision: f.records.books[0].updatedAt.toISOString() });
  const body = edit(8);
  f.concurrentNext();
  const [checkout, adjusted] = await Promise.all([f.request('/orders', f.body),
    adminHandler(f.db, 'admin-books', 'put', '/books/:id', String(f.bookId), body)]);
  assert.equal(checkout.status, 201); assert.ok([200, 409].includes(adjusted.status));
  assert.equal(f.records.books[0].stock, adjusted.status === 200 ? 7 : 4);
  assert.equal(f.records.books[0].stock, f.records.old_books[0].stock);
  const nextBody = edit(9), stockBefore = f.records.books[0].stock;
  f.concurrentNext();
  const [cancelled, nextAdjusted] = await Promise.all([
    f.request('/account/orders/' + checkout.body._id + '/cancel', {}, { method: 'PUT' }),
    adminHandler(f.db, 'admin-books', 'put', '/books/:id', String(f.bookId), nextBody)]);
  assert.equal(cancelled.status, 200); assert.ok([200, 409].includes(nextAdjusted.status));
  assert.equal(f.records.books[0].stock, nextAdjusted.status === 200 ? 10 : stockBefore + 1);
  assert.equal(f.records.books[0].stock, f.records.old_books[0].stock);
  assert.equal(f.records.vouchers[0].usedCount, 0);
});
test('Voucher rename racing first checkout fails instead of losing a legacy link', async (t) => {
  const f = await checkoutFixture(t, { perUser: 1 }); configureVoucher(f);
  const voucher = f.records.vouchers[0];
  f.beforeNextUpdate('vouchers', async () => { assert.equal((await f.request('/orders', f.body)).status, 201); });
  const changed = await adminHandler(f.db, 'admin-vouchers', 'put', '/vouchers/:id', String(voucher._id), voucherEdit('RENAMED'));
  assert.equal(changed.status, 409);
  assert.equal(f.records.vouchers[0].code, 'QA10');
  assert.equal(f.records.vouchers[0].usedCount, 1);
  assert.equal((await f.request('/orders', f.body, { key: 'race-second-key-0002' })).status, 409);
});
test('Already renamed legacy voucher with unexplained usage fails closed without guessing voucherId', async (t) => {
  const f = await checkoutFixture(t, { perUser: 1 });
  assert.equal((await f.request('/orders', f.body)).status, 201);
  delete f.records.orders[0].voucherId;
  f.records.vouchers[0].code = 'RENAMED';
  const before = clone(f.records);
  const response = await f.request('/orders', { ...f.body, voucherCode: 'RENAMED' }, { key: 'legacy-second-key-0002' });
  assert.equal(response.status, 409);
  assert.match(response.body.message, /đối soát/);
  assert.deepEqual(f.records, before);
});
test('Refund rollback and concurrent replay preserve payment, entitlement history and exactly-once revocation', async (t) => {
  const { f, refund } = await ebookRefundFixture(t, true);
  const before = clone(f.records);
  for (const operation of ['orders.updateOne', 'personalBooks.updateOne', 'return_requests.updateOne']) {
    f.failNext(operation);
    await assert.rejects(refund(), /Injected/);
    assert.deepEqual(f.records, before);
  }
  f.concurrentNext();
  await Promise.all([refund(), refund()]);
  assert.equal(f.records.orders[0].paymentStatus, 'refunded');
  assert.equal(f.records.orders[0].statusHistory.length, 2);
  assert.equal(f.records.return_requests[0].statusHistory.length, 1);
  assert.equal(f.records.personalBooks.length, 1);
  assert.ok(f.records.personalBooks[0].accessRevokedAt instanceof Date);
  assert.equal(String(f.records.personalBooks[0].accessRevokedOrderId), String(f.records.orders[0]._id));
});
test('Progress write authorized before refund cannot write after entitlement revocation commits', async (t) => {
  const { f, refund } = await ebookRefundFixture(t, true);
  f.allowAtomicWrites();
  f.beforeNextUpdate('personalBooks', refund);
  const response = await f.request('/account/ebooks/' + f.bookId + '/progress', { page: 99 }, { method: 'PUT' });
  assert.equal(response.status, 403);
  assert.equal(f.records.personalBooks[0].page, 2);
  assert.ok(f.records.personalBooks[0].accessRevokedAt instanceof Date);
});
test('Revoking one purchase preserves another verified purchase and never changes demo entitlements', async (t) => {
  const { f, refund } = await ebookRefundFixture(t, true);
  const original = f.records.orders[0], alternative = clone(original);
  alternative._id = new ObjectId(); alternative.orderCode = 'OTHER-VERIFIED-PURCHASE';
  f.records.orders.push(alternative);
  const demo = { ...clone(f.records.personalBooks[0]), _id: new ObjectId(), isDemo: true };
  f.records.personalBooks.push(demo, { ...clone(f.records.personalBooks[0]), _id: new ObjectId(),
    orderCode: alternative.orderCode, orderId: alternative._id });
  const demoBefore = clone(demo);
  await refund();
  const shelf = await f.request('/account/ebooks', undefined, { method: 'GET' });
  assert.equal(shelf.status, 200); assert.equal(shelf.body.length, 1);
  assert.equal((await f.request('/account/ebooks/' + f.bookId + '/progress', undefined, { method: 'GET' })).status, 200);
  assert.deepEqual(f.records.personalBooks[1], demoBefore);
  assert.equal(f.records.personalBooks.length, 3);
});


test('Verified legacy orderCode entitlement retains normal progress APIs without accepting client payment claims', async (t) => {
  const { f } = await ebookRefundFixture(t, true);
  f.allowAtomicWrites();
  const row = f.records.personalBooks[0], order = clone(f.records.orders[0]), code = row.orderCode;
  const path = '/account/ebooks/' + f.bookId + '/progress';
  const response = await f.request(path, { page: 5, bookmarks: [2], notes: row.notes, highlights: [],
    orderCode: 'FAKE', accessRevokedAt: null, paymentStatus: 'paid',
    paymentVerification: { source: 'client' } }, { method: 'PUT' });
  assert.equal(response.status, 200);
  assert.equal(f.records.personalBooks[0].page, 5);
  assert.equal(f.records.personalBooks[0].orderCode, code);
  assert.deepEqual(f.records.orders[0], order);
  assert.equal((await f.request(path, undefined, { method: 'GET' })).body.page, 5);
  assert.equal((await f.request(path, undefined, { method: 'GET', other: true })).status, 404);
});
