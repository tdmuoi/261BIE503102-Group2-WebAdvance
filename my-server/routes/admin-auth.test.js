// Isolated HTTP fixtures only. Does not load .env or connect to MongoDB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { randomBytes } = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const authRoutes = require('./admin-auth');

test('Admin bcrypt compatibility and missing installation diagnostics', async (t) => {
  const password = randomBytes(24).toString('hex');
  const originalHash = await bcrypt.hash(password, 10);
  let account;
  const db = {
    collection(name) {
      if (name === 'accounts') return {
        find: () => ({ project: () => ({ limit: () => ({ toArray: async () => [account] }) }) }),
        findOne: async () => account,
      };
      if (name === 'roles') return {
        findOne: async () => ({ code: 'SUPER_ADMIN', permissions: [] }),
      };
      if (name === 'users') return { findOne: async () => ({ fullName: 'Fixture Admin' }) };
      throw new Error('Unexpected collection');
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/admin/auth', authRoutes(() => db, {
    allowedOrigins: ['http://localhost:4201'],
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/auth`;
  function setAccount(suffix, hash = originalHash) {
    account = {
      _id: 'fixture-admin', email: `${suffix}@example.invalid`,
      roleCode: 'SUPER_ADMIN', status: 'active', provider: 'local', passwordHash: hash,
    };
  }
  function login(secret = password) {
    return fetch(`${base}/login`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:4201', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: secret, rememberMe: false }),
    });
  }
  await t.test('2a, 2b and 2y hashes create a usable HttpOnly server session', async () => {
    for (const prefix of ['2a', '2b', '2y']) {
      setAccount(prefix, `$${prefix}${originalHash.slice(3)}`);
      const response = await login();
      assert.equal(response.status, 200);
      const cookie = response.headers.get('set-cookie');
      assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'));
      const session = await fetch(`${base}/session`, {
        headers: { Origin: 'http://localhost:4201', Cookie: cookie.split(';')[0] },
      });
      assert.equal(session.status, 200);
      const body = await session.json();
      assert.equal(Object.hasOwn(body.user, 'passwordHash'), false);
      assert.equal(Object.hasOwn(body.user, 'password'), false);
    }
  });
  await t.test('a missing bcryptjs installation returns 503 without issuing a session', async () => {
    setAccount('missing-driver');
    const originalLoad = Module._load;
    let response;
    try {
      Module._load = function (name, ...args) {
        if (name === 'bcryptjs') {
          const error = new Error('Fixture missing driver');
          error.code = 'MODULE_NOT_FOUND';
          throw error;
        }
        return originalLoad.call(this, name, ...args);
      };
      response = await login();
    } finally {
      Module._load = originalLoad;
    }
    assert.equal(response.status, 503);
    assert.equal(response.headers.has('set-cookie'), false);
    const body = await response.json();
    assert.equal(body.code, 'AUTH_BCRYPT_UNAVAILABLE');
    assert.ok(body.message.includes('bcryptjs'));
    assert.equal((await login()).status, 200);
  });
  await t.test('weak bcrypt cost and passwords exceeding 72 bytes fail closed', async () => {
    setAccount('weak-cost', await bcrypt.hash(password, 9));
    assert.equal((await login()).status, 401);
    setAccount('long-password');
    assert.equal((await login('x'.repeat(73))).status, 401);
  });
});
