// Isolated HTTP tests. Fixtures live only in memory; no MongoDB connection is opened.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const newsletterRoutes = require('./newsletter');

async function startApp(t, updateOne) {
  const app = express();
  app.use(express.json());
  app.use('/api', newsletterRoutes(() => ({ collection: () => ({ updateOne }) })));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (body) => fetch(`http://127.0.0.1:${server.address().port}/api/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Giả lập collection: nhớ email và các chủ đề như updateOne upsert + $addToSet */
function memoryUpdateOne() {
  const rows = new Map();
  return async ({ email }, { $addToSet: { topics: topic } }) => {
    const topics = rows.get(email);
    if (!topics) {
      rows.set(email, new Set([topic]));
      return { upsertedCount: 1, modifiedCount: 0 };
    }
    if (topics.has(topic)) return { upsertedCount: 0, modifiedCount: 0 };
    topics.add(topic);
    return { upsertedCount: 0, modifiedCount: 1 };
  };
}

test('đăng ký mới trả 201, trùng email (kể cả khác hoa thường) trả 409', async (t) => {
  const post = await startApp(t, memoryUpdateOne());
  assert.equal((await post({ email: 'Doc.Gia@vidu.com ', topic: 'news' })).status, 201);
  assert.equal((await post({ email: 'doc.gia@vidu.com', topic: 'news' })).status, 409);
});

test('email đã nhận tin news vẫn đăng ký thêm được events', async (t) => {
  const post = await startApp(t, memoryUpdateOne());
  await post({ email: 'a@vidu.com', topic: 'news' });
  assert.equal((await post({ email: 'a@vidu.com', topic: 'events' })).status, 200);
});

test('email hoặc chủ đề sai trả 400 và không ghi DB', async (t) => {
  let writes = 0;
  const post = await startApp(t, async () => { writes++; });
  assert.equal((await post({ email: 'khong-phai-email', topic: 'news' })).status, 400);
  assert.equal((await post({ email: { $gt: '' }, topic: 'news' })).status, 400);
  assert.equal((await post({ email: 'a@vidu.com', topic: 'khac' })).status, 400);
  assert.equal(writes, 0);
});

test('hai yêu cầu cùng lúc vướng index unique thì báo đã đăng ký', async (t) => {
  const post = await startApp(t, async () => { throw Object.assign(new Error('dup'), { code: 11000 }); });
  assert.equal((await post({ email: 'a@vidu.com', topic: 'news' })).status, 409);
});
