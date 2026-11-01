// All writes below target in-memory fixtures. No MongoDB connection or .env is used.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const { scryptSync } = require("node:crypto");
const express = require("express");
const createAuth = require("../middleware/admin-auth");
const settingsRoutes = require("./admin-settings");
const origin = "http://localhost:4201";
test("Settings HTTP: auth, permissions, CSRF, safe projection, validation and versioned updates", async (t) => {
  const accountId = new ObjectId();
  const settingsId = new ObjectId();
  const salt = "1234567890abcdef1234567890abcdef";
  const password = "Settings-test-password-123";
  const hash = `scrypt$32768$8$3$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
  let permissions = [{ module: "settings", actions: ["view", "update"] }];
  let docs = [
    {
      _id: settingsId,
      language: "Vietnamese",
      freePreviewLimit: 10,
      vnpayConnected: true,
      momoConnected: false,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      watermarkText: "Existing",
      encryptionLevel: "Existing",
      roles: ["untouched"],
      aboutUsContent: { sections: ["untouched"] },
      privatePaymentKey: "secret-never-return",
    },
  ];
  let writes = 0;
  let projection;
  const account = {
    _id: accountId,
    email: "settings@example.test",
    status: "active",
    provider: "local",
    roleCode: "CONTENT_MANAGER",
    passwordHash: hash,
  };
  const collection = {
    find(query, options) {
      projection = options?.projection;
      return {
        limit() {
          return this;
        },
        async toArray() {
          return structuredClone(docs).map((d) => ({ ...d, _id: settingsId }));
        },
      };
    },
    async updateOne(filter, update) {
      assert.equal(filter._id.toString(), settingsId.toString());
      assert.ok(!("upsert" in update));
      if (+filter.updatedAt !== +docs[0].updatedAt) return { matchedCount: 0 };
      writes++;
      for (const [path, value] of Object.entries(update.$set)) {
        const parts = path.split(".");
        let target = docs[0];
        for (const p of parts.slice(0, -1)) target = target[p] ||= {};
        target[parts.at(-1)] = value;
      }
      return { matchedCount: 1 };
    },
  };
  const db = {
    collection(name) {
      if (name === "settings") return collection;
      if (name === "accounts")
        return {
          find() {
            return {
              project() {
                return this;
              },
              limit() {
                return this;
              },
              async toArray() {
                return [account];
              },
            };
          },
          async findOne() {
            return account;
          },
        };
      if (name === "roles")
        return {
          async findOne() {
            return { name: "Test role", permissions };
          },
        };
      if (name === "users")
        return {
          async findOne() {
            return { fullName: "Test admin" };
          },
        };
      throw new Error("Unexpected collection");
    },
  };
  const auth = createAuth(() => db);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/settings",
    settingsRoutes(() => db),
  );
  app.post("/api/admin/auth/login", auth.cors, auth.login);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  const request = (
    path = "/api/admin/settings",
    method = "GET",
    body,
    headers = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-Admin-CSRF": csrf } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await request()).status, 401);
  assert.equal(
    (
      await request(undefined, "OPTIONS", undefined, {
        "Access-Control-Request-Method": "PATCH",
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request(undefined, "GET", undefined, {
        Origin: "http://localhost:4200",
      })
    ).status,
    403,
  );
  const login = await request("/api/admin/auth/login", "POST", {
    email: account.email,
    password,
    rememberMe: false,
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  csrf = (await login.json()).csrfToken;
  let response = await request();
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.values.freePreviewLimit, 10);
  assert.equal(data.values.storeName, "");
  assert.equal(data.paymentMethods[0].configured, true);
  assert.equal(data.paymentMethods[2].configured, null);
  assert.ok(!JSON.stringify(data).includes("secret-never-return"));
  assert.ok(!projection.privatePaymentKey);
  assert.equal(writes, 0);
  const revision = data.revision;
  assert.equal(
    (
      await request(
        undefined,
        "PATCH",
        { revision, changes: { storeName: "Book shop" } },
        { "X-Admin-CSRF": "wrong" },
      )
    ).status,
    403,
  );
  permissions = [{ module: "settings", actions: ["view"] }];
  assert.equal(
    (
      await request(undefined, "PATCH", {
        revision,
        changes: { storeName: "Book shop" },
      })
    ).status,
    403,
  );
  permissions = [{ module: "settings", actions: ["view", "update"] }];
  for (const changes of [
    { shippingFee: -1 },
    { deviceLimit: 1.5 },
    { supportEmail: "bad" },
    { logoUrl: "javascript:alert(1)" },
    { roles: ["admin"] },
    { carriers: ["UNKNOWN"] },
    { formats: ["PDF", "PDF"] },
    { currency: "USD" },
  ])
    assert.equal(
      (await request(undefined, "PATCH", { revision, changes })).status,
      400,
    );
  assert.equal(
    (
      await request(undefined, "PATCH", {
        revision,
        changes: { payments: { vnpay: true } },
      })
    ).status,
    501,
  );
  assert.equal(
    (
      await request(undefined, "PATCH", {
        revision: "stale",
        changes: { storeName: "Shop" },
      })
    ).status,
    409,
  );
  assert.equal(writes, 0);
  response = await request(undefined, "PATCH", {
    revision,
    changes: {
      storeName: "Book shop",
      freePreviewLimit: 20,
      shippingFee: 25000,
      carriers: ["GHN"],
      formats: ["PDF", "EPUB"],
    },
  });
  assert.equal(response.status, 200);
  data = await response.json();
  assert.equal(data.values.storeName, "Book shop");
  assert.equal(data.values.shippingFee, 25000);
  assert.equal(data.values.freePreviewLimit, 20);
  assert.equal(data.updatedBy, "Test admin");
  assert.equal(writes, 1);
  const reloaded = await (await request()).json();
  assert.equal(reloaded.values.storeName, 'Book shop');
  assert.equal(reloaded.values.freePreviewLimit, 20);
  assert.equal(reloaded.values.shippingFee, 25000);
  assert.equal(docs[0].privatePaymentKey, "secret-never-return");
  assert.deepEqual(docs[0].roles, ["untouched"]);
  assert.deepEqual(docs[0].aboutUsContent, { sections: ["untouched"] });
  assert.equal(docs[0].vnpayConnected, true);
  assert.equal(docs[0].encryptionLevel, "Existing");
  assert.equal(
    (
      await request(undefined, "PATCH", {
        revision,
        changes: { storeName: "Another" },
      })
    ).status,
    409,
  );
  docs.push({ ...docs[0] });
  assert.equal((await request()).status, 409);
  assert.equal(writes, 1);
});
