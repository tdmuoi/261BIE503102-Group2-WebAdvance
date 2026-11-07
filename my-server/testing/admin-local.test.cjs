if (process.env.LIGHTBOOKS_LOCAL_QA !== "1") {
  require("node:test").test(
    "Opt-in isolated MongoDB integration",
    { skip: "Set LIGHTBOOKS_LOCAL_QA=1 with dedicated 27019 fixture server" },
    () => {},
  );
} else {
  ("use strict");
  const fs = require("node:fs"),
    path = require("node:path"),
    assert = require("node:assert/strict"),
    { test, before, after } = require("node:test");

  const { MongoClient, ObjectId } = require("mongodb");
  const express = require("express");
  const proposed = path.resolve(__dirname, "..");
  const transition = require(proposed + "/middleware/admin-safe-status");
  let client, db, server, base;
  const dbName = "lightbooks_qa_fixture_" + Date.now();
  let passed = [];
  function fixture(overrides = {}) {
    return {
      _id: new ObjectId(),
      userId: new ObjectId(),
      status: "pending",
      paymentStatus: "unpaid",
      paymentMethod: "cod",
      stockDeducted: true,
      restocked: false,
      statusHistory: [],
      items: [],
      ...overrides,
    };
  }
  async function book(type = "new", stock = 3) {
    const b = {
      _id: new ObjectId(),
      title: "Isolated fixture",
      bookType: type,
      stock,
      status: "active",
    };
    await db.collection("books").insertOne(b);
    return b;
  }
  async function order(b, overrides = {}) {
    const o = fixture({
      items: [
        {
          bookId: b._id,
          title: "Isolated fixture",
          format: b.bookType === "ebook" ? "ebook" : "print",
          quantity: 1,
          price: 100,
        },
      ],
      total: 100,
      shippingFee: 0,
      discount: 0,
      ...overrides,
    });
    await db.collection("orders").insertOne(o);
    return o;
  }
  before(async () => {
    const initial = new MongoClient(
      "mongodb://127.0.0.1:27019/?directConnection=true",
    );
    await initial.connect();
    try {
      await initial.db("admin").command({
        replSetInitiate: {
          _id: "lightbooksQa",
          members: [{ _id: 0, host: "127.0.0.1:27019" }],
        },
      });
    } catch (e) {
      if (e.codeName !== "AlreadyInitialized") throw e;
    } finally {
      await initial.close();
    }
    client = new MongoClient(
      "mongodb://127.0.0.1:27019/?replicaSet=lightbooksQa",
      { serverSelectionTimeoutMS: 15000 },
    );
    await client.connect();
    db = client.db(dbName);
    assert(
      !(await client.db("admin").admin().listDatabases()).databases.some(
        (x) => x.name === dbName,
      ),
    );
    // Explicit isolated fixture database. No production/backup data is copied or edited.
    for (const name of [
      "books",
      "orders",
      "return_requests",
      "users",
      "roles",
      "accounts",
      "categories",
      "banners",
    ])
      await db.createCollection(name);
    const createAuth = require(proposed + "/middleware/admin-auth");
    const auth = createAuth(() => db, {
      allowedOrigins: ["http://localhost:4201"],
    });
    const app = express();
    app.use(express.json());
    app.use(
      "/api/admin",
      auth.cors,
      require(proposed + "/middleware/admin-qa-access")(auth),
    );
    app.post("/api/admin/auth/login", auth.login);
    app.use(
      "/api/admin",
      require(proposed + "/routes/admin-books")(() => db),
    );
    app.use(
      "/api/admin",
      require(proposed + "/routes/admin-orders")(
        () => db,
        () => client,
      ),
    );
    app.use(
      "/api/admin",
      require(proposed + "/routes/admin-returns")(
        () => db,
        () => client,
      ),
    );
    app.use(
      "/api/admin",
      require(proposed + "/routes/admin-dashboard")(() => db),
    );
    app.use(
      "/api",
      require(proposed + "/routes/admin-banners")(() => db),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = "http://127.0.0.1:" + server.address().port;
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (client) await client.close();
    fs.writeFileSync(
      path.join(
        process.env.LIGHTBOOKS_QA_OUTPUT_DIR || require("node:os").tmpdir(),
        "local-backend-test-result.json",
      ),
      JSON.stringify(
        {
          database: dbName,
          localPort: 27019,
          testsPassed: passed,
          status: passed.length === 16 ? "PASS" : "FAILED",
          atlasWrites: 0,
        },
        null,
        2,
      ),
    );
  });
  function check(name, fn) {
    test(name, async () => {
      await fn();
      passed.push(name);
    });
  }
  check("anonymous access rejected on five admin API groups", async () => {
    for (const route of ["books", "orders", "returns", "dashboard", "banners"])
      assert.equal(
        (await fetch(base + "/api/admin/" + route.toUpperCase())).status,
        401,
      );
  });
  check("concurrent cancellation is atomic and idempotent", async () => {
    const b = await book();
    const o = await order(b);
    await Promise.all(
      [1, 2].map(() =>
        transition(db, client, "orders", String(o._id), {
          status: "cancelled",
          note: "Fixture",
          restock: true,
        }),
      ),
    );
    assert.equal(
      (await db.collection("books").findOne({ _id: b._id })).stock,
      4,
    );
    assert.equal(
      (await db.collection("orders").findOne({ _id: o._id })).statusHistory
        .length,
      1,
    );
  });
  check("ebook cancellation never increments stock", async () => {
    const b = await book("ebook", 0),
      o = await order(b);
    await transition(db, client, "orders", String(o._id), {
      status: "cancelled",
      note: "Fixture",
      restock: true,
    });
    assert.equal(
      (await db.collection("books").findOne({ _id: b._id })).stock,
      0,
    );
  });
  check(
    "missing book rolls back earlier stock increments and order status",
    async () => {
      const b = await book(),
        o = await order(b, {
          items: [
            { bookId: b._id, quantity: 1, price: 100, format: "print" },
            {
              bookId: new ObjectId(),
              quantity: 1,
              price: 100,
              format: "print",
            },
          ],
        });
      await assert.rejects(
        transition(db, client, "orders", String(o._id), {
          status: "cancelled",
          note: "Fixture",
          restock: true,
        }),
      );
      assert.equal(
        (await db.collection("books").findOne({ _id: b._id })).stock,
        3,
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: o._id })).status,
        "pending",
      );
    },
  );
  check("demo and ownerless mutations are blocked without writes", async () => {
    const b = await book();
    for (const overrides of [{ isDemo: true }, { userId: null }]) {
      const o = await order(b, overrides);
      await assert.rejects(
        transition(db, client, "orders", String(o._id), {
          status: "confirmed",
        }),
        (e) => e.status === 409,
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: o._id })).status,
        "pending",
      );
    }
  });
  check(
    "full return restocks once and prevents duplicate inventory credit",
    async () => {
      const b = await book(),
        o = await order(b, { status: "delivered", paymentStatus: "paid" });
      const r = fixture({
        orderId: o._id,
        userId: o.userId,
        status: "approved",
        items: o.items,
        type: "refund",
      });
      await db.collection("return_requests").insertOne(r);
      await Promise.all(
        [1, 2].map(() =>
          transition(db, client, "returns", String(r._id), {
            status: "received",
            restock: true,
          }),
        ),
      );
      assert.equal(
        (await db.collection("books").findOne({ _id: b._id })).stock,
        4,
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: o._id })).restocked,
        true,
      );
    },
  );
  check(
    "full refund commits request and original payment exactly once",
    async () => {
      const b = await book(),
        o = await order(b, { status: "delivered", paymentStatus: "paid" });
      const r = fixture({
        orderId: o._id,
        userId: o.userId,
        status: "received",
        items: o.items,
        type: "refund",
      });
      await db.collection("return_requests").insertOne(r);
      await Promise.all(
        [1, 2].map(() =>
          transition(db, client, "returns", String(r._id), {
            status: "refunded",
            refundAmount: 100,
          }),
        ),
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: o._id })).paymentStatus,
        "refunded",
      );
      assert.equal(
        (await db.collection("return_requests").findOne({ _id: r._id }))
          .statusHistory.length,
        1,
      );
    },
  );
  check(
    "shipping allocation stays blocked without changing financial data",
    async () => {
      const b = await book(),
        o = await order(b, {
          status: "delivered",
          paymentStatus: "paid",
          shippingFee: 20,
          total: 120,
        });
      const r = fixture({
        orderId: o._id,
        userId: o.userId,
        status: "received",
        items: o.items,
        type: "refund",
      });
      await db.collection("return_requests").insertOne(r);
      await assert.rejects(
        transition(db, client, "returns", String(r._id), {
          status: "refunded",
          refundAmount: 100,
        }),
        (e) => e.status === 409,
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: o._id })).paymentStatus,
        "paid",
      );
      assert.equal(
        (await db.collection("return_requests").findOne({ _id: r._id })).status,
        "received",
      );
    },
  );
  check(
    "standalone MongoDB rejects transaction workflow before writes",
    async () => {
      const c = new MongoClient("mongodb://127.0.0.1:27018");
      try {
        await c.connect();
        await assert.rejects(
          transition(c.db(dbName), c, "orders", String(new ObjectId()), {
            status: "confirmed",
          }),
          (e) => e.status === 503,
        );
      } finally {
        await c.close();
      }
    },
  );
  check(
    "dashboard excludes demos, unpaid revenue, admins and ebooks from stock alerts",
    async () => {
      const build = require(
        proposed + "/routes/admin-dashboard",
      ).buildDashboard;
      const now = new Date();
      const fixtureDb = {
        listCollections: () => ({
          toArray: async () =>
            [
              "books",
              "categories",
              "orders",
              "accounts",
              "return_requests",
            ].map((name) => ({ name })),
        }),
        collection: (name) => ({
          find: () => ({
            toArray: async () =>
              ({
                books: [
                  { _id: "e", bookType: "ebook", stock: 0, status: "active" },
                  { _id: "p", bookType: "new", stock: 0, status: "active" },
                ],
                categories: [],
                orders: [
                  {
                    userId: "u",
                    total: 100,
                    status: "delivered",
                    paymentStatus: "paid",
                    createdAt: now,
                  },
                  {
                    userId: "u",
                    total: 500,
                    status: "pending",
                    paymentStatus: "unpaid",
                    createdAt: now,
                  },
                  {
                    isDemo: true,
                    userId: null,
                    total: 900,
                    status: "delivered",
                    paymentStatus: "paid",
                    createdAt: now,
                  },
                ],
                accounts: [
                  { roleCode: "CUSTOMER" },
                  { roleCode: "SUPER_ADMIN" },
                  { roleCode: "SALES_MANAGER" },
                ],
                return_requests: [],
              })[name],
          }),
        }),
      };
      const result = await build(fixtureDb, 7, now);
      assert.equal(result.stats.revenue.value, 100);
      assert.equal(result.stats.orders.value, 2);
      assert.equal(result.stats.customers.value, 1);
      assert.equal(result.inventory.outOfStockCount, 1);
      assert.equal(
        result.salesChart.reduce((a, b) => a + b.revenue, 0),
        100,
      );
    },
  );
  check("unsupported banner position never silently maps to hero", async () => {
    const id = new ObjectId();
    await db.collection("banners").insertOne({
      _id: id,
      position: "home_secondary",
      title: "Fixture",
      active: true,
    });
    const response = await fetch(base + "/api/banners?position=hero");
    assert.equal(response.status, 200);
    assert(!(await response.json()).some((b) => b._id === String(id)));
  });
  check(
    "permission actions use actual roles and require CSRF for writes",
    async () => {
      const crypto = require("node:crypto"),
        password = crypto.randomBytes(20).toString("hex"),
        salt = crypto.randomBytes(16).toString("hex");
      const key = await new Promise((resolve, reject) =>
        crypto.scrypt(
          password,
          salt,
          64,
          { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
          (e, k) => (e ? reject(e) : resolve(k)),
        ),
      );
      const email = "fixture@example.invalid";
      await db.collection("roles").insertOne({
        code: "SALES_MANAGER",
        permissions: [
          {
            module: "orders",
            actions: ["view", "confirm", "cancel", "refund"],
          },
        ],
      });
      await db.collection("accounts").insertOne({
        email,
        provider: "local",
        status: "active",
        roleCode: "SALES_MANAGER",
        passwordHash: "scrypt$32768$8$3$" + salt + "$" + key.toString("hex"),
      });
      const login = await fetch(base + "/api/admin/auth/login", {
        method: "POST",
        headers: {
          Origin: "http://localhost:4201",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, rememberMe: false }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie").split(";")[0],
        session = await login.json();
      assert(login.headers.get("set-cookie").includes("HttpOnly"));
      assert.equal(
        (
          await fetch(base + "/api/admin/books", {
            headers: { Cookie: cookie },
          })
        ).status,
        403,
      );
      const b = await book(),
        o = await order(b);
      const url = base + "/api/admin/orders/" + String(o._id) + "/status";
      const options = {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:4201",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "confirmed" }),
      };
      assert.equal((await fetch(url, options)).status, 403);
      options.headers["X-Admin-CSRF"] = session.csrfToken;
      assert.equal((await fetch(url, options)).status, 200);
      const preflight = await fetch(base + "/api/admin/books/x", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:4201",
          "Access-Control-Request-Method": "DELETE",
        },
      });
      assert.equal(preflight.status, 204);
      assert(
        preflight.headers
          .get("access-control-allow-methods")
          .includes("DELETE"),
      );
    },
  );

  check("books persist type/condition and advertise capability", async () => {
    const express = require("express"),
      app = express();
    app.use(express.json());
    app.use(require(proposed + "/routes/admin-books")(() => db));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const url = "http://127.0.0.1:" + server.address().port;
    try {
      const cat = { _id: new ObjectId(), name: "Fixture" };
      await db.collection("categories").insertOne(cat);
      const response = await fetch(url + "/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Fixture used book",
          price: 10,
          stock: 1,
          categoryId: String(cat._id),
          bookType: "used",
          condition: "Verified fixture condition",
        }),
      });
      assert.equal(response.status, 201);
      const saved = await response.json();
      assert.equal(saved.bookType, "used");
      assert.equal(saved.condition, "Verified fixture condition");
      const list = await (await fetch(url + "/books")).json();
      assert.equal(list.capabilities.bookClassification, true);
      const invalid = await fetch(url + "/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Fixture invalid ebook",
          price: 10,
          stock: 1,
          categoryId: String(cat._id),
          bookType: "ebook",
        }),
      });
      assert.equal(invalid.status, 400);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
  check(
    "conflicting banner aliases block updates and impossible dates fail validation",
    async () => {
      const express = require("express"),
        app = express();
      app.use(express.json());
      app.use(require(proposed + "/routes/admin-banners")(() => db));
      const server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const url = "http://127.0.0.1:" + server.address().port;
      try {
        const doc = {
          _id: new ObjectId(),
          position: "hero",
          active: true,
          startDate: new Date("2026-01-01"),
          startAt: new Date("2027-01-01"),
        };
        await db.collection("banners").insertOne(doc);
        const response = await fetch(
          url + "/admin/banners/" + String(doc._id),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: false }),
          },
        );
        assert.equal(response.status, 409);
        assert.equal(
          (await db.collection("banners").findOne({ _id: doc._id })).active,
          true,
        );
        const invalid = await fetch(url + "/admin/banners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Fixture",
            title: "Fixture",
            startDate: "2099-02-30",
          }),
        });
        assert.equal(invalid.status, 400);
      } finally {
        await new Promise((r) => server.close(r));
      }
    },
  );

  check(
    "legacy-only banner dates retain their existing alias without duplicate fields",
    async () => {
      const app = express();
      app.use(express.json());
      app.use(require(proposed + "/routes/admin-banners")(() => db));
      const server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const url = "http://127.0.0.1:" + server.address().port;
      try {
        const doc = {
          _id: new ObjectId(),
          name: "Legacy fixture",
          title: "Legacy fixture",
          position: "hero",
          active: true,
          startAt: new Date("2099-01-01T17:00:00Z"),
        };
        await db.collection("banners").insertOne(doc);
        const response = await fetch(
          url + "/admin/banners/" + String(doc._id),
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: doc.name,
              title: doc.title,
              position: "hero",
              active: true,
              startDate: "2099-01-02",
              endDate: "",
            }),
          },
        );
        assert.equal(response.status, 200);
        const stored = await db.collection("banners").findOne({ _id: doc._id });
        assert.equal(Object.hasOwn(stored, "startDate"), false);
        assert.equal(stored.startAt.toISOString(), "2099-01-01T17:00:00.000Z");
      } finally {
        await new Promise((r) => server.close(r));
      }
    },
  );

  check(
    "trailing slash and uppercase paths cannot bypass operation permissions",
    async () => {
      const password = require("node:crypto").randomBytes(20).toString("hex");
      const hash = await require("bcryptjs").hash(password, 10);
      await db.collection("roles").insertOne({
        code: "WAREHOUSE_MANAGER",
        permissions: [
          { module: "orders", actions: ["view", "update"] },
          { module: "products", actions: ["view", "update"] },
        ],
      });
      const email = "warehouse@example.invalid";
      await db
        .collection("accounts")
        .insertOne({
          email,
          provider: "local",
          status: "active",
          roleCode: "WAREHOUSE_MANAGER",
          passwordHash: hash,
        });
      const login = await fetch(base + "/api/admin/auth/login", {
        method: "POST",
        headers: {
          Origin: "http://localhost:4201",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, rememberMe: false }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie").split(";")[0];
      const session = await login.json();
      const headers = {
        Cookie: cookie,
        Origin: "http://localhost:4201",
        "Content-Type": "application/json",
        "X-Admin-CSRF": session.csrfToken,
      };
      const b = await book();
      const o = await order(b);
      assert.equal(
        (
          await fetch(base + "/api/admin/orders/" + o._id + "/STATUS/", {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "confirmed" }),
          })
        ).status,
        403,
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: o._id })).status,
        "pending",
      );
      assert.equal(
        (
          await fetch(base + "/api/admin/orders/" + o._id, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ adminNote: "Permitted fixture note" }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "/api/admin/books/bulk/", {
            method: "PATCH",
            headers,
            body: JSON.stringify({ ids: [String(b._id)], action: "delete" }),
          })
        ).status,
        403,
      );
    },
  );
}
