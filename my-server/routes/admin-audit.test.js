// Integration HTTP tests use an isolated in-memory repository only. Never connects to MongoDB.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { scryptSync } = require("node:crypto");
const express = require("express");
const { ObjectId } = require("mongodb");
const same = (a, b) =>
  a instanceof Date || b instanceof Date
    ? +new Date(a) === +new Date(b)
    : String(a) === String(b);
const expression = (doc, x) => {
  if (typeof x === "string" && x.startsWith("$")) return doc[x.slice(1)];
  if (!x || typeof x !== "object" || x instanceof Date) return x;
  const [op, args] = Object.entries(x)[0];
  const v = Array.isArray(args) ? args.map((a) => expression(doc, a)) : [];
  return op === "$ifNull"
    ? (v[0] ?? v[1])
    : op === "$lt"
      ? v[0] < v[1]
      : op === "$lte"
        ? v[0] <= v[1]
        : op === "$gte"
          ? v[0] >= v[1]
          : false;
};
function matches(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (k === "$and") return v.every((x) => matches(doc, x));
    if (k === "$or") return v.some((x) => matches(doc, x));
    if (k === "$expr") return expression(doc, v);
    if (
      v instanceof ObjectId ||
      v instanceof Date ||
      v === null ||
      typeof v !== "object"
    )
      return same(doc[k], v);
    if ("$in" in v) return v.$in.some((x) => same(doc[k], x));
    if ("$ne" in v) return !same(doc[k], v.$ne);
    if ("$exists" in v) return (doc[k] !== undefined) === v.$exists;
    if ("$regex" in v)
      return new RegExp(v.$regex, v.$options).test(doc[k] || "");
    return Object.entries(v).every(([op, value]) =>
      op === "$gte"
        ? doc[k] >= value
        : op === "$lte"
          ? doc[k] <= value
          : op === "$lt"
            ? doc[k] < value
            : op === "$gt"
              ? doc[k] > value
              : false,
    );
  });
}
function cursor(rows) {
  let values = rows;
  return {
    project(p) {
      values = values.map((d) =>
        Object.fromEntries(
          Object.entries(d).filter(([k]) => k === "_id" || p[k]),
        ),
      );
      return this;
    },
    sort(sort) {
      values.sort((a, b) => {
        for (const [k, dir] of Object.entries(sort)) {
          if (a[k] < b[k]) return -dir;
          if (a[k] > b[k]) return dir;
        }
        return 0;
      });
      return this;
    },
    skip(n) {
      values = values.slice(n);
      return this;
    },
    limit(n) {
      values = values.slice(0, n);
      return this;
    },
    async toArray() {
      return values.map((v) => ({ ...v }));
    },
  };
}
test("Admin audit: real auth middleware and scoped business APIs with isolated fixtures", async (t) => {
  const salt = "0123456789abcdef0123456789abcdef",
    password = "Audit-test-password-123";
  const hash = `scrypt$32768$8$3$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
  const adminId = new ObjectId(),
    profileId = new ObjectId(),
    customerId = new ObjectId(),
    customerProfile = new ObjectId(),
    otherAdminId = new ObjectId();
  const permission = [
    { module: "accounts", actions: ["view", "update"] },
    { module: "customers", actions: ["view", "update"] },
    { module: "vouchers", actions: ["view", "create", "update"] },
    { module: "liquidation", actions: ["view", "approve", "reject"] },
  ];
  const admin = {
    _id: adminId,
    email: "audit@example.test",
    provider: "local",
    status: "active",
    roleCode: "SUPER_ADMIN",
    passwordHash: hash,
  };
  const records = {
    accounts: [
      admin,
      {
        _id: customerId,
        email: "customer@example.test",
        roleCode: "CUSTOMER",
        status: "active",
      },
      {
        _id: otherAdminId,
        email: "other@example.test",
        roleCode: "CONTENT_MANAGER",
        provider: "local",
        status: "active",
        passwordHash: hash,
      },
    ],
    users: [
      { _id: profileId, accountId: adminId, fullName: "Audit Admin" },
      { _id: customerProfile, accountId: customerId, fullName: "Customer" },
      { _id: new ObjectId(), accountId: otherAdminId, fullName: "Other Admin" },
    ],
    roles: [
      {
        _id: new ObjectId(),
        code: "SUPER_ADMIN",
        name: "Super",
        permissions: permission,
      },
      {
        _id: new ObjectId(),
        code: "CONTENT_MANAGER",
        name: "Content",
        permissions: [{ module: "content", actions: ["view"] }],
      },
      {
        _id: new ObjectId(),
        code: "SALES_MANAGER",
        name: "Sales",
        permissions: [
          { module: "liquidation", actions: ["view", "approve", "reject"] },
        ],
      },
    ],
    orders: [
      {
        _id: new ObjectId(),
        userId: customerProfile,
        orderCode: "UNPAID",
        status: "delivered",
        paymentStatus: "unpaid",
        total: 900000,
        createdAt: new Date(),
      },
      {
        _id: new ObjectId(),
        userId: customerProfile,
        orderCode: "PAID",
        status: "completed",
        paymentStatus: "paid",
        total: 100000,
        createdAt: new Date(),
      },
    ],
    vouchers: [],
    liquidation: [
      {
        _id: new ObjectId(),
        requestCode: "REQ1",
        title: "Book",
        customer: { name: "Customer", phone: "0900" },
        status: "pending",
        offerPrice: null,
        suggestedPrice: null,
        images: [],
        imageIsCatalogCover: true,
        createdAt: new Date(),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    addresses: [],
  };
  let writes = 0;
  const db = {
    client: {
      startSession() {
        return {
          async withTransaction(work) {
            return work();
          },
          async endSession() {},
        };
      },
    },
    listCollections() {
      return cursor(Object.keys(records).map((name) => ({ name })));
    },
    collection(name) {
      assert.ok(Object.hasOwn(records, name), "Unexpected collection " + name);
      return {
        find(q = {}, opts) {
          const cur = cursor(records[name].filter((d) => matches(d, q)));
          return opts?.projection ? cur.project(opts.projection) : cur;
        },
        async findOne(q) {
          return records[name].find((d) => matches(d, q)) || null;
        },
        async countDocuments(q = {}) {
          return records[name].filter((d) => matches(d, q)).length;
        },
        aggregate(p) {
          const group = p[0]?.$group;
          return cursor(
            group
              ? [
                  {
                    _id: null,
                    total: records[name].reduce(
                      (sum, d) =>
                        sum +
                        (typeof d.usedCount === "number" ? d.usedCount : 0),
                      0,
                    ),
                  },
                ]
              : [],
          );
        },
        async insertOne(d) {
          await new Promise((r) => setTimeout(r, 5));
          const _id = new ObjectId();
          records[name].push({ ...d, _id });
          writes++;
          return { insertedId: _id };
        },
        async updateOne(q, u) {
          const d = records[name].find((x) => matches(x, q));
          if (!d) return { matchedCount: 0 };
          Object.assign(d, u.$set);
          writes++;
          return { matchedCount: 1 };
        },
      };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/auth",
    require("./admin-auth")(() => db),
  );
  app.use(
    "/api/admin/accounts",
    require("./admin-accounts")(() => db),
  );
  app.use(
    "/api/admin",
    require("./admin-vouchers")(() => db),
  );
  app.use(
    "/api/admin/buybacks",
    require("./admin-buybacks")(() => db),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  const request = (path, method = "GET", body, extra = {}) =>
    fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:4201",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-Admin-CSRF": csrf } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  async function login(pass = password) {
    const r = await request("/api/admin/auth/login", "POST", {
      email: admin.email,
      password: pass,
      rememberMe: false,
    });
    if (r.status === 200) {
      cookie = r.headers.get("set-cookie").split(";")[0];
      csrf = (await r.json()).csrfToken;
    }
    return r;
  }
  await t.test(
    "unauthenticated APIs, wrong passwords, cookie flags and CSRF",
    async () => {
      for (const p of [
        "/api/admin/accounts/customers",
        "/api/admin/vouchers",
        "/api/admin/buybacks",
      ])
        assert.equal((await request(p)).status, 401);
      assert.equal((await login("wrong")).status, 401);
      const r = await login();
      assert.equal(r.status, 200);
      const c = r.headers.get("set-cookie");
      assert.match(c, /HttpOnly/i);
      assert.match(c, /SameSite=Strict/i);
      assert.match(c, /Path=\/api\/admin/i);
      assert.equal(
        (
          await request(
            "/api/admin/auth/logout",
            "POST",
            {},
            { "X-Admin-CSRF": "wrong" },
          )
        ).status,
        403,
      );
      assert.equal((await request("/api/admin/auth/session")).status, 200);
    },
  );
  await t.test(
    "customer metrics require confirmed payment; history and CSV stay linked",
    async () => {
      const r = await request("/api/admin/accounts/customers");
      assert.equal(r.status, 200);
      const data = await r.json();
      assert.equal(data.items[0].orderCount, 2);
      assert.equal(data.items[0].totalSpent, 100000);
      const detail = await (
        await request("/api/admin/accounts/customers/" + customerProfile)
      ).json();
      assert.equal(detail.orders.length, 2);
      assert.equal(detail.metrics.averageOrderValue, 100000);
      assert.equal(detail.buybacks.items.length, 0);
      const csv = await request("/api/admin/accounts/customers/export");
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get("content-type"), /csv/);
      assert.equal(
        (await request("/api/admin/accounts/customers/" + new ObjectId()))
          .status,
        404,
      );
    },
  );
  await t.test(
    "Admin role escalation, self-lock and unsupported actions cannot write",
    async () => {
      const before = writes;
      const superRole = records.roles[0];
      assert.equal(
        (
          await request("/api/admin/accounts/admins/" + otherAdminId, "PATCH", {
            roleId: String(superRole._id),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/api/admin/accounts/admins/" + adminId, "PATCH", {
            status: "locked",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/api/admin/accounts/customers/" + customerProfile + "/actions",
            "POST",
            { action: "reset-password" },
          )
        ).status,
        501,
      );
      assert.equal(writes, before);
      const target = (
        await (await request("/api/admin/accounts/admins")).json()
      ).items.find((row) => row._id === String(otherAdminId));
      assert.equal(target.revision, null);
      const lockResponse = await request(
        "/api/admin/accounts/admins/" + otherAdminId,
        "PATCH",
        { status: "locked", revision: target.revision },
      );
      assert.equal(lockResponse.status, 200);
      const locked = await lockResponse.json();
      assert.equal(records.accounts[2].status, "locked");
      const beforeStale = writes;
      assert.equal(
        (
          await request("/api/admin/accounts/admins/" + otherAdminId, "PATCH", {
            fullName: "Stale editor",
            email: "stale@example.test",
            status: "active",
            revision: target.revision,
          })
        ).status,
        409,
      );
      assert.equal(writes, beforeStale);
      assert.equal(records.accounts[2].status, "locked");
      assert.equal(
        (
          await request("/api/admin/accounts/admins/" + otherAdminId, "PATCH", {
            status: "active",
            revision: locked.revision,
          })
        ).status,
        200,
      );
    },
  );
  await t.test('account-only edits stay atomic without a transaction client; profile edits fail closed', async () => {
    const client = db.client;
    db.client = undefined;
    try {
      const url = '/api/admin/accounts/admins/' + otherAdminId;
      const target = (await (await request('/api/admin/accounts/admins')).json()).items
        .find((row) => row._id === String(otherAdminId));
      const lockedResponse = await request(url, 'PATCH', { status: 'locked', revision: target.revision });
      assert.equal(lockedResponse.status, 200);
      const locked = await lockedResponse.json();
      const before = writes;
      assert.equal((await request(url, 'PATCH', { fullName: 'Changed profile', revision: locked.revision })).status, 501);
      assert.equal(writes, before);
      assert.equal((await request(url, 'PATCH', { status: 'active', revision: target.revision })).status, 409);
      assert.equal((await request(url, 'PATCH', {
        fullName: 'Other Admin', status: 'active', revision: locked.revision,
      })).status, 200);
    } finally {
      db.client = client;
    }
  });
  await t.test(
    "demo payments are not counted as real customer spend",
    async () => {
      records.orders.push({
        _id: new ObjectId(),
        userId: customerProfile,
        status: "completed",
        paymentStatus: "paid",
        total: 999999,
        isDemo: true,
      });
      try {
        const data = await (
          await request("/api/admin/accounts/customers")
        ).json();
        assert.equal(data.items[0].totalSpent, 100000);
      } finally {
        records.orders.pop();
      }
    },
  );
  await t.test('profile and email edits use the transaction path and preserve account identity/role', async () => {
    const url = '/api/admin/accounts/admins/' + otherAdminId;
    const target = (await (await request('/api/admin/accounts/admins')).json()).items
      .find((row) => row._id === String(otherAdminId));
    const response = await request(url, 'PATCH', {
      fullName: 'Updated Admin', email: 'updated@example.test', revision: target.revision,
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.fullName, 'Updated Admin');
    assert.equal(saved.email, 'updated@example.test');
    assert.equal(records.accounts[2].roleCode, 'CONTENT_MANAGER');
    assert.equal(records.users.find((row) => same(row.accountId, otherAdminId)).fullName, 'Updated Admin');
    const reloaded = (await (await request('/api/admin/accounts/admins')).json()).items
      .find((row) => row._id === String(otherAdminId));
    assert.equal(reloaded.revision, saved.revision);
    assert.equal(reloaded.fullName, saved.fullName);
  });
  const payload = {
    name: "Audit offer",
    code: "AUDIT25",
    description: "Test",
    type: "percent",
    value: 25,
    maxDiscount: 50000,
    minOrder: 0,
    limit: 10,
    perCustomer: 1,
    start: "2020-01-01",
    end: "2099-12-31",
    categories: [],
    newOnly: false,
    suggest: false,
    paused: true,
  };
  let voucher;
  await t.test(
    "Voucher duplicate races, dates, limits, paused state and stale edits",
    async () => {
      const invalid = await request("/api/admin/vouchers", "POST", {
        ...payload,
        start: "2026-02-30",
      });
      assert.equal(invalid.status, 400);
      const concurrent = await Promise.all([
        request("/api/admin/vouchers", "POST", payload),
        request("/api/admin/vouchers", "POST", payload),
      ]);
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
      voucher = await concurrent.find((r) => r.status === 201).json();
      assert.equal(voucher.state, "paused");
      const r = await request("/api/admin/vouchers/" + voucher._id, "PUT", {
        ...payload,
        name: "Updated",
        revision: voucher.updatedAt,
      });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).state, "paused");
      assert.equal(
        (
          await request("/api/admin/vouchers/" + voucher._id, "PUT", {
            ...payload,
            revision: voucher.updatedAt,
          })
        ).status,
        409,
      );
      const list = await (
        await request("/api/admin/vouchers?q=Updated")
      ).json();
      assert.equal(list.total, 1);
      records.vouchers[0].usedCount = 10;
      const exhausted = await request(
        "/api/admin/vouchers/" + voucher._id + "/status",
        "PATCH",
        { paused: false },
      );
      assert.equal(exhausted.status, 409);
      const current = await (
        await request("/api/admin/vouchers/" + voucher._id)
      ).json();
      assert.equal(
        (
          await request("/api/admin/vouchers/" + voucher._id, "PUT", {
            ...payload,
            limit: 9,
            revision: current.updatedAt,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "Buyback state machine, valuation, unknown fields, stale replay and payment refusal",
    async () => {
      const list = await (await request("/api/admin/buybacks")).json();
      let row = list.items[0];
      assert.equal(row.shipping, null);
      assert.equal(row.quantity, null);
      assert.equal(row.price, null);
      assert.equal(
        (
          await request("/api/admin/buybacks/" + row.id, "PATCH", {
            action: "quote",
            revision: row.revision,
            offerPrice: 50000,
            resalePrice: 80000,
          })
        ).status,
        409,
      );
      const original = row.revision;
      let r = await request("/api/admin/buybacks/" + row.id, "PATCH", {
        action: "approve",
        revision: row.revision,
      });
      assert.equal(r.status, 200);
      row = await r.json();
      assert.equal(row.status, "reviewing");
      assert.equal(
        (
          await request("/api/admin/buybacks/" + row.id, "PATCH", {
            action: "approve",
            revision: original,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/api/admin/buybacks/" + row.id, "PATCH", {
            action: "quote",
            revision: row.revision,
            offerPrice: 50000,
            resalePrice: 40000,
          })
        ).status,
        400,
      );
      r = await request("/api/admin/buybacks/" + row.id, "PATCH", {
        action: "quote",
        revision: row.revision,
        offerPrice: 50000,
        resalePrice: 80000,
      });
      assert.equal(r.status, 200);
      row = await r.json();
      assert.equal(row.offerPrice, 50000);
      assert.equal(Object.hasOwn(records.liquidation[0], "resalePrice"), false);
      assert.equal(Object.hasOwn(records.liquidation[0], "adminNote"), false);
      const priceOnly = await request(
        "/api/admin/buybacks/" + row.id,
        "PATCH",
        { action: "quote", revision: row.revision, offerPrice: 45000 },
      );
      assert.equal(priceOnly.status, 200);
      row = await priceOnly.json();
      const reloaded = await (
        await request("/api/admin/buybacks/" + row.id)
      ).json();
      assert.equal(reloaded.offerPrice, 45000);
      assert.equal(reloaded.resalePrice, null);
      assert.equal(
        (
          await request("/api/admin/buybacks/" + row.id, "PATCH", {
            action: "paid",
            revision: row.revision,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/api/admin/buybacks/" + row.id, "PATCH", {
            action: "reject",
            revision: row.revision,
          })
        ).status,
        400,
      );
      r = await request("/api/admin/buybacks/" + row.id, "PATCH", {
        action: "reject",
        revision: row.revision,
        note: "Rejected after inspection",
      });
      assert.equal(r.status, 200);
      row = await r.json();
      assert.equal(row.status, "rejected");
      assert.match(records.liquidation[0].note, /Rejected after inspection/);
      assert.equal(
        (
          await request("/api/admin/buybacks/" + row.id, "PATCH", {
            action: "quote",
            revision: row.revision,
            offerPrice: 50000,
            resalePrice: 80000,
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "role permission changes, account locks, password revocation and idle expiry",
    async () => {
      admin.roleCode = "CONTENT_MANAGER";
      assert.equal((await request("/api/admin/buybacks")).status, 403);
      assert.equal((await request("/api/admin/accounts/admins")).status, 403);
      const beforeDenied = writes;
      assert.equal((await request('/api/admin/vouchers')).status, 403);
      assert.equal((await request('/api/admin/vouchers', 'POST', { code: 'DENIED' })).status, 403);
      assert.equal(writes, beforeDenied);
      assert.equal((await request('/api/admin/auth/session')).status, 200);
      admin.roleCode = "SUPER_ADMIN";
      admin.status = "locked";
      assert.equal((await request("/api/admin/auth/session")).status, 403);
      admin.status = "active";
      await login();
      admin.passwordHash = hash + "changed";
      assert.equal((await request("/api/admin/auth/session")).status, 403);
      admin.passwordHash = hash;
      await login();
      const originalNow = Date.now;
      Date.now = () => originalNow() + 31 * 60 * 1000;
      try {
        assert.equal((await request("/api/admin/auth/session")).status, 401);
      } finally {
        Date.now = originalNow;
      }
      await login();
      assert.equal(
        (await request("/api/admin/auth/logout", "POST", {})).status,
        204,
      );
      assert.equal((await request("/api/admin/auth/session")).status, 401);
    },
  );
  await t.test("bcrypt login and login rate limits are enforced", async () => {
    admin.passwordHash = require("bcryptjs").hashSync(password, 10);
    assert.equal((await login()).status, 200);
    assert.equal((await request("/api/admin/auth/session")).status, 200);
    for (let i = 0; i < 5; i++)
      assert.equal((await login("wrong")).status, 401);
    const limited = await login("wrong");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "900");
  });
});
