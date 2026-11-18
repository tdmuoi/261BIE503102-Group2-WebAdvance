// Kiểm tra luồng OTP của web khách: xác minh email khi đăng ký, xác thực 2 lớp, quên mật khẩu.
// Chạy: node --test routes/customer-otp.test.js   (dùng database giả trong bộ nhớ, không cần MongoDB)
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');

process.env.GMAIL_USER = 'lightbook.test@gmail.com';
process.env.GMAIL_APP_PASSWORD = 'test-app-password';
const mailer = require('../middleware/mailer');
const otp = require('../middleware/customer-otp');

// ---------------------------------------------------------------- database giả
const same = (a, b) => (a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b);
const get = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
function matches(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some((x) => matches(doc, x));
    const value = get(doc, k);
    if (v === null) return value == null;
    if (v instanceof ObjectId || v instanceof Date || typeof v !== 'object') return same(value, v);
    if ('$regex' in v) return new RegExp(v.$regex, v.$options).test(value || '');
    if ('$in' in v) return v.$in.some((x) => same(value, x));
    if ('$gt' in v) return value > v.$gt;
    return JSON.stringify(value) === JSON.stringify(v);
  });
}
function fakeDb() {
  const data = {};
  const col = (name) => (data[name] ??= []);
  const apply = (doc, u) => {
    Object.assign(doc, u.$set || {});
    for (const [k, n] of Object.entries(u.$inc || {})) doc[k] = (doc[k] || 0) + n;
    for (const k of Object.keys(u.$unset || {})) delete doc[k];
  };
  return {
    data,
    collection(name) {
      return {
        async createIndex() {},
        async findOne(q) { const d = col(name).find((x) => matches(x, q)); return d ? { ...d } : null; }, // bản sao như MongoDB thật
        async insertOne(d) { const _id = d._id || new ObjectId(); col(name).push({ ...d, _id }); return { insertedId: _id }; },
        async updateOne(q, u, opts) {
          const d = col(name).find((x) => matches(x, q));
          if (!d) {
            if (opts?.upsert) col(name).push({ _id: new ObjectId(), ...q, ...(u.$setOnInsert || {}) });
            return { matchedCount: 0 };
          }
          apply(d, u);
          return { matchedCount: 1 };
        },
        async updateMany(q, u) { const list = col(name).filter((x) => matches(x, q)); list.forEach((d) => apply(d, u)); return { matchedCount: list.length }; },
        async deleteOne(q) { const i = col(name).findIndex((x) => matches(x, q)); if (i >= 0) col(name).splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
        async deleteMany(q) { const before = col(name).length; data[name] = col(name).filter((x) => !matches(x, q)); return { deletedCount: before - data[name].length }; },
      };
    },
  };
}

// ---------------------------------------------------------------- dựng server thử
async function setup(t) {
  otp._resetIndexesForTest();
  const db = fakeDb();
  db.data.vouchers = [{ _id: new ObjectId(), code: 'WELCOME10', status: 'active' }];
  const sent = [];
  mailer._setTransportForTest({ sendMail: async (m) => { sent.push(m); } });
  const app = express();
  app.use(express.json());
  app.use('/api', require('./customer-auth')(() => db));
  app.use((err, req, res, next) => res.status(500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const lastCode = () => /(\d{6})/.exec(sent.at(-1).subject)[1];
  // Cho phép "gửi lại" ngay mà không phải đợi 60 giây thật
  const skipCooldown = () => db.data.otp_challenges.forEach((c) => { c.lastSentAt = new Date(Date.now() - 61000); });
  return { db, sent, post, lastCode, skipCooldown };
}

const account = { fullName: 'Khach Thu', email: 'khach.thu@gmail.com', phone: '0911000111', password: 'Matkhau123', newsletter: false };
const wrongCode = (code) => String((Number(code) + 1) % 1000000).padStart(6, '0');

test('đăng ký: chưa đăng nhập ngay, gửi OTP xác minh email; nhập đúng mã mới có phiên + mã giảm giá', async (t) => {
  const { db, sent, post, lastCode } = await setup(t);
  const reg = await post('/auth/register', account);
  assert.equal(reg.status, 201);
  assert.equal(reg.body.verificationRequired, true);
  assert.equal(reg.body.token, undefined, 'chưa được cấp phiên trước khi xác minh');
  assert.match(reg.body.challengeId, /^[a-f\d]{48}$/);
  assert.equal(reg.body.email, 'kh******u@gmail.com');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'khach.thu@gmail.com');
  assert.equal(db.data.otp_challenges[0].codeHash.includes(lastCode()), false, 'database không lưu mã gốc');

  // Đăng nhập khi chưa xác minh → được yêu cầu OTP, không có token
  const login = await post('/auth/login', { identifier: account.email, type: 'email', password: account.password, remember: true });
  assert.equal(login.status, 200);
  assert.equal(login.body.verificationRequired, true);
  assert.equal(login.body.token, undefined);
  assert.equal(login.body.challengeId, reg.body.challengeId, 'trong 60 giây thì dùng lại mã vừa gửi, không gửi thêm');
  assert.equal(sent.length, 1);

  const bad = await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: wrongCode(lastCode()) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.remainingAttempts, 4);

  const ok = await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: lastCode() });
  assert.equal(ok.status, 200);
  assert.match(ok.body.token, /^[a-f\d]{64}$/);
  assert.equal(ok.body.user.email, account.email);
  assert.deepEqual(ok.body.coupon, { code: 'WELCOME10' });
  assert.equal(db.data.accounts[0].emailVerified, true);
  assert.equal('emailVerificationPending' in db.data.accounts[0], false);

  // Mã chỉ dùng được 1 lần
  assert.equal((await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: lastCode() })).status, 400);
  // Đã xác minh thì đăng nhập thẳng
  const again = await post('/auth/login', { identifier: account.email, type: 'email', password: account.password, remember: false });
  assert.match(again.body.token, /^[a-f\d]{64}$/);
});

test('nhập sai 5 lần thì khoá mã, phải gửi lại; gửi lại có chờ 60 giây và tối đa 5 lần', async (t) => {
  const { sent, post, lastCode, skipCooldown } = await setup(t);
  const reg = await post('/auth/register', account);
  const code = lastCode();
  for (let i = 0; i < 5; i++) assert.equal((await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: wrongCode(code) })).status, 400);
  const locked = await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code });
  assert.equal(locked.status, 429, 'đúng mã cũng không nhận sau 5 lần sai');

  const tooSoon = await post('/auth/otp/resend', { challengeId: reg.body.challengeId });
  assert.equal(tooSoon.status, 429);
  assert.ok(tooSoon.body.retryAfter > 0);

  skipCooldown();
  const resent = await post('/auth/otp/resend', { challengeId: reg.body.challengeId });
  assert.equal(resent.status, 200);
  assert.equal(sent.length, 2);
  assert.notEqual(lastCode(), code);
  assert.equal((await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code })).status, 400, 'mã cũ hết tác dụng');
  assert.equal((await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: lastCode() })).status, 200);

  const bogus = await post('/auth/otp/resend', { challengeId: 'abc' });
  assert.equal(bogus.status, 410);
});

test('xác thực 2 lớp: bật trong hồ sơ thì đăng nhập phải nhập thêm OTP', async (t) => {
  const { db, sent, post, lastCode } = await setup(t);
  const reg = await post('/auth/register', account);
  await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: lastCode() });
  db.data.users[0].twoFactorEnabled = true;

  const login = await post('/auth/login', { identifier: '0911000111', type: 'phone', password: account.password, remember: true });
  assert.equal(login.status, 200);
  assert.equal(login.body.twoFactorRequired, true);
  assert.equal(login.body.purpose, 'login_2fa');
  assert.equal(login.body.token, undefined);
  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /đăng nhập/i);

  // Mã đăng nhập không dùng để đặt lại mật khẩu được
  const misuse = await post('/auth/reset-password', { challengeId: login.body.challengeId, code: lastCode(), newPassword: 'Moi12345' });
  assert.equal(misuse.status, 410);

  const ok = await post('/auth/otp/verify', { challengeId: login.body.challengeId, code: lastCode() });
  assert.equal(ok.status, 200);
  assert.match(ok.body.token, /^[a-f\d]{64}$/);
  assert.equal(ok.body.coupon, undefined, 'mã giảm giá chỉ tặng khi xác minh email lúc đăng ký');
  const session = db.data.customer_sessions.at(-1);
  assert.ok(session.expiresAt - Date.now() > 20 * 24 * 3600 * 1000, '"Ghi nhớ đăng nhập" được giữ qua bước OTP');

  // Sai mật khẩu thì không gửi OTP
  const wrong = await post('/auth/login', { identifier: account.email, type: 'email', password: 'Sai123456', remember: false });
  assert.equal(wrong.status, 401);
  assert.equal(sent.length, 2);
});

test('quên mật khẩu: OTP + mật khẩu mới, đăng xuất mọi thiết bị; email lạ trả về giống hệt nhưng không gửi', async (t) => {
  const { db, sent, post, lastCode } = await setup(t);
  const reg = await post('/auth/register', account);
  await post('/auth/otp/verify', { challengeId: reg.body.challengeId, code: lastCode() });
  assert.equal(db.data.customer_sessions.length, 1);

  const unknown = await post('/auth/forgot-password', { email: 'nguoi.la@gmail.com' });
  assert.equal(unknown.status, 200);
  assert.match(unknown.body.challengeId, /^[a-f\d]{48}$/);
  assert.equal(sent.length, 1, 'không gửi email cho địa chỉ chưa đăng ký');
  assert.equal((await post('/auth/reset-password', { challengeId: unknown.body.challengeId, code: '123456', newPassword: 'Moi12345' })).status, 400);

  const forgot = await post('/auth/forgot-password', { email: 'KHACH.THU@gmail.com' });
  assert.equal(forgot.status, 200);
  assert.deepEqual(Object.keys(forgot.body).sort(), Object.keys(unknown.body).sort());
  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /đặt lại mật khẩu/i);

  const weak = await post('/auth/reset-password', { challengeId: forgot.body.challengeId, code: lastCode(), newPassword: 'ngan' });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.field, 'newPassword');

  const reset = await post('/auth/reset-password', { challengeId: forgot.body.challengeId, code: lastCode(), newPassword: 'Moi12345' });
  assert.equal(reset.status, 200);
  assert.equal(db.data.customer_sessions.length, 0, 'phiên cũ bị đăng xuất');

  const oldPw = await post('/auth/login', { identifier: account.email, type: 'email', password: account.password });
  assert.equal(oldPw.status, 401);
  const newPw = await post('/auth/login', { identifier: account.email, type: 'email', password: 'Moi12345' });
  assert.match(newPw.body.token, /^[a-f\d]{64}$/);
});

test('tài khoản tạo trước khi có OTP vẫn đăng nhập thẳng như cũ', async (t) => {
  const { db, sent, post } = await setup(t);
  const { hashPassword } = require('../middleware/customer-auth');
  const accountId = new ObjectId();
  db.data.accounts = [{ _id: accountId, email: 'cu@gmail.com', passwordHash: await hashPassword('Matkhau123'), roleCode: 'CUSTOMER', status: 'active' }];
  db.data.users = [{ _id: new ObjectId(), accountId, fullName: 'Khach Cu' }];
  const login = await post('/auth/login', { identifier: 'cu@gmail.com', type: 'email', password: 'Matkhau123' });
  assert.equal(login.status, 200);
  assert.match(login.body.token, /^[a-f\d]{64}$/);
  assert.equal(sent.length, 0);
});

test('gửi email lỗi thì báo 502, không để lại mã treo', async (t) => {
  const { db, post } = await setup(t);
  mailer._setTransportForTest({ sendMail: async () => { throw new Error('Invalid login'); } });
  const reg = await post('/auth/register', account);
  assert.equal(reg.status, 502);
  assert.equal(reg.body.accountCreated, true);
  assert.equal((db.data.otp_challenges || []).length, 0);
});
