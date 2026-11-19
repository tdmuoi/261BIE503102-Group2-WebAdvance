const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');

function fakeDb() {
  const data = {};
  const matches = (doc, filter) => Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const value = key.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
    if (cond && typeof cond === 'object' && '$regex' in cond) return typeof value === 'string' && new RegExp(cond.$regex, cond.$options).test(value);
    if (cond && typeof cond === 'object' && '$gt' in cond) return value > cond.$gt;
    return String(value) === String(cond);
  });
  const setPath = (doc, path, value) => {
    const keys = path.split('.');
    let target = doc;
    for (const k of keys.slice(0, -1)) target = target[k] ??= {};
    target[keys.at(-1)] = value;
  };
  const collection = (name) => {
    const rows = (data[name] ??= []);
    return {
      rows,
      async createIndex() {},
      async findOne(filter) { return rows.find((d) => matches(d, filter)) ?? null; },
      async insertOne(doc) { doc._id ??= new ObjectId(); rows.push(doc); return { insertedId: doc._id }; },
      async updateOne(filter, update) {
        const doc = rows.find((d) => matches(d, filter));
        if (doc) for (const [k, v] of Object.entries(update.$set ?? {})) setPath(doc, k, v);
        return { matchedCount: doc ? 1 : 0 };
      },
      async findOneAndDelete(filter) {
        const i = rows.findIndex((d) => matches(d, filter));
        return i === -1 ? null : rows.splice(i, 1)[0];
      },
      async deleteOne(filter) { const i = rows.findIndex((d) => matches(d, filter)); if (i >= 0) rows.splice(i, 1); },
      async deleteMany() {},
    };
  };
  const cache = {};
  return { data, collection: (name) => (cache[name] ??= collection(name)) };
}

async function setup(profile) {
  process.env.GOOGLE_CLIENT_ID = 'cid';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  process.env.CLIENT_URL = 'https://shop.example';
  const providers = require('../middleware/oauth-providers');
  providers.PROVIDERS.google.profile = async () => profile;
  const db = fakeDb();
  const app = express();
  app.use(express.json());
  app.use('/api', require('./customer-auth')(() => db));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { db, base, close: () => server.close() };
}

async function loginFlow(base) {
  const start = await fetch(`${base}/auth/oauth/google/start?returnUrl=/cart`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const google = new URL(start.headers.get('location'));
  assert.equal(google.origin, 'https://accounts.google.com');
  const state = google.searchParams.get('state');
  const cb = await fetch(`${base}/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: 'manual' });
  assert.equal(cb.status, 302);
  return new URL(cb.headers.get('location'));
}

test('Google lần đầu tạo tài khoản khách và đổi mã lấy phiên đăng nhập một lần', async () => {
  const { db, base, close } = await setup({ id: 'g-1', email: 'New@Gmail.com', name: 'Người Mới', avatar: 'https://lh3.googleusercontent.com/a' });
  try {
    const back = await loginFlow(base);
    assert.equal(back.origin + back.pathname, 'https://shop.example/login');
    assert.equal(back.searchParams.get('returnUrl'), '/cart');
    const code = back.searchParams.get('oauth');
    const res = await fetch(`${base}/auth/oauth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.match(body.token, /^[a-f\d]{64}$/);
    assert.equal(body.user.email, 'new@gmail.com');
    assert.equal(body.user.fullName, 'Người Mới');
    assert.equal(body.user.avatar, 'https://lh3.googleusercontent.com/a');
    const account = db.data.accounts[0];
    assert.deepEqual([account.provider, account.providerId, account.roleCode, account.passwordHash], ['google', 'g-1', 'CUSTOMER', null]);
    const again = await fetch(`${base}/auth/oauth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    assert.equal(again.status, 410);
  } finally { close(); }
});

test('Email đã đăng ký bằng mật khẩu được liên kết, không tạo tài khoản trùng', async () => {
  const { db, base, close } = await setup({ id: 'g-2', email: 'old@gmail.com', name: 'X', avatar: null });
  try {
    const accountId = new ObjectId();
    await db.collection('accounts').insertOne({ _id: accountId, email: 'old@gmail.com', provider: 'local', roleCode: 'CUSTOMER', status: 'active', passwordHash: 'h' });
    await db.collection('users').insertOne({ accountId, fullName: 'Khách Cũ' });
    const back = await loginFlow(base);
    const res = await fetch(`${base}/auth/oauth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: back.searchParams.get('oauth') }) });
    const body = await res.json();
    assert.equal(body.user.fullName, 'Khách Cũ');
    assert.equal(db.data.accounts.length, 1);
    assert.equal(db.data.accounts[0].oauth.google, 'g-2');
    assert.equal(db.data.accounts[0].passwordHash, 'h');
  } finally { close(); }
});

test('Email của tài khoản admin hoặc state giả bị từ chối', async () => {
  const { db, base, close } = await setup({ id: 'g-3', email: 'admin@lightbook.vn', name: 'A', avatar: null });
  try {
    await db.collection('accounts').insertOne({ email: 'admin@lightbook.vn', roleCode: 'SUPER_ADMIN', status: 'active' });
    const back = await loginFlow(base);
    assert.match(back.searchParams.get('oauthError'), /quản trị/);
    assert.equal(back.searchParams.get('oauth'), null);
    const forged = await fetch(`${base}/auth/oauth/google/callback?code=abc&state=${'f'.repeat(64)}`, { redirect: 'manual' });
    assert.match(new URL(forged.headers.get('location')).searchParams.get('oauthError'), /hết hạn/);
  } finally { close(); }
});
