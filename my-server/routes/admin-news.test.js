// Isolated HTTP tests. Fixtures live only in memory; no MongoDB connection is opened.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { scryptSync } = require("node:crypto");
const express = require("express");
const { ObjectId } = require("mongodb");
const publicRoutes = require("./news");
const authRoutes = require("./admin-auth");
const origin = "http://localhost:4201";
const accountId = new ObjectId();
const salt = "1234567890abcdef1234567890abcdef";
const password = "News-test-password-123";
const hash = `scrypt$32768$8$3$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const same = (a, b) =>
  a instanceof Date || b instanceof Date
    ? +new Date(a) === +new Date(b)
    : String(a) === String(b);
function expression(doc, value) {
  if (typeof value === "string" && value.startsWith("$"))
    return doc[value.slice(1)];
  if (!value || typeof value !== "object" || value instanceof Date)
    return value;
  const [operator, args] = Object.entries(value)[0];
  if (operator === "$convert") {
    const input = expression(doc, args.input);
    if (input == null) return args.onNull;
    const date = new Date(input);
    return Number.isFinite(date.getTime()) ? date : args.onError;
  }
  if (operator === "$cond")
    return expression(doc, args[0])
      ? expression(doc, args[1])
      : expression(doc, args[2]);
  const values = args.map((item) => expression(doc, item));
  if (operator === "$and") return values.every(Boolean);
  if (operator === "$or") return values.some(Boolean);
  if (operator === "$eq") return same(values[0], values[1]);
  if (operator === "$ne") return !same(values[0], values[1]);
  if (operator === "$lte") return values[0] <= values[1];
  if (operator === "$gt") return values[0] > values[1];
  throw new Error("Unsupported fixture expression: " + operator);
}
function matches(doc, query) {
  return Object.entries(query).every(([k, v]) => {
    if (k === "$or") return v.some((q) => matches(doc, q));
    if (k === "$and") return v.every((q) => matches(doc, q));
    if (k === "$expr") return expression(doc, v);
    if (v instanceof RegExp) return v.test(doc[k] || "");
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof ObjectId) &&
      !(v instanceof Date)
    ) {
      if ("$exists" in v) return (doc[k] !== undefined) === v.$exists;
      if ("$lte" in v) return doc[k] != null && new Date(doc[k]) <= v.$lte;
      if ("$regex" in v) return new RegExp(v.$regex, v.$options).test(doc[k]);
    }
    return same(doc[k], v);
  });
}
function cursor(items) {
  let values = items;
  return {
    sort() {
      return this;
    },
    project() {
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
test("News API: auth, CSRF, roles, validation, drafts, publish, schedule, concurrency and filters", async (t) => {
  let records = [];
  let permissions = [
    { module: "content", actions: ["view", "create", "update", "publish"] },
  ];
  const collection = {
    find: (query) => cursor(records.filter((d) => matches(d, query))),
    findOne: async (query) => records.find((d) => matches(d, query)) || null,
    distinct: async (field, query = {}) => [
      ...new Set(records.filter((d) => matches(d, query)).map((d) => d[field])),
    ],
    countDocuments: async (query) =>
      records.filter((d) => matches(d, query)).length,
    insertOne: async (doc) => {
      const _id = new ObjectId();
      records.push({ ...doc, _id });
      return { insertedId: _id };
    },
    updateOne: async (query, update) => {
      const doc = records.find((d) => matches(d, query));
      if (doc) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
    aggregate: (pipeline) => {
      let docs = records.map((d) => ({ ...d }));
      for (const stage of pipeline) {
        if (stage.$set)
          docs = docs.map((doc) => ({
            ...doc,
            ...Object.fromEntries(
              Object.entries(stage.$set).map(([field, value]) => [
                field,
                expression(doc, value),
              ]),
            ),
          }));
        if (stage.$match) docs = docs.filter((d) => matches(d, stage.$match));
        if (stage.$skip) docs = docs.slice(stage.$skip);
        if (stage.$limit) docs = docs.slice(0, stage.$limit);
        if (stage.$count) docs = docs.length ? [{ total: docs.length }] : [];
        if (stage.$group) {
          const groups = {};
          for (const doc of docs) {
            const g = (groups[doc.status] ||= {
              _id: doc.status,
              count: 0,
              views: 0,
            });
            g.count++;
            g.views += doc.views || 0;
          }
          docs = Object.values(groups);
        }
      }
      return cursor(docs);
    },
  };
  const db = {
    collection(name) {
      if (name === "news") return collection;
      if (name === "accounts")
        return {
          find: () =>
            cursor([
              {
                _id: accountId,
                email: "news@example.test",
                provider: "local",
                roleCode: "CONTENT_MANAGER",
                status: "active",
                passwordHash: hash,
              },
            ]),
          findOne: async () => ({
            _id: accountId,
            email: "news@example.test",
            provider: "local",
            roleCode: "CONTENT_MANAGER",
            status: "active",
            passwordHash: hash,
          }),
        };
      if (name === "roles")
        return {
          findOne: async () => ({
            code: "CONTENT_MANAGER",
            name: "Content manager",
            permissions,
          }),
        };
      if (name === "users")
        return { findOne: async () => ({ fullName: "Test editor" }) };
      throw new Error("Unexpected collection");
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/auth",
    authRoutes(() => db),
  );
  app.use(
    "/api",
    publicRoutes(() => db),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  async function request(path, method = "GET", body, headers = {}) {
    return fetch(base + path, {
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
  }
  assert.equal((await request("/api/admin/news")).status, 401);
  let response = await request("/api/admin/news", "OPTIONS", undefined, {
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": "X-Admin-CSRF",
  });
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-credentials"),
    "true",
  );
  response = await request("/api/admin/auth/login", "POST", {
    email: "news@example.test",
    password,
    rememberMe: false,
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";")[0];
  csrf = (await response.json()).csrfToken;
  assert.equal(
    (
      await request(
        "/api/admin/news",
        "POST",
        { title: "Draft", status: "draft" },
        { "X-Admin-CSRF": "bad" },
      )
    ).status,
    403,
  );
  permissions = [{ module: "content", actions: ["view"] }];
  assert.equal(
    (
      await request("/api/admin/news", "POST", {
        title: "Draft",
        status: "draft",
      })
    ).status,
    403,
  );
  permissions = [
    { module: "content", actions: ["view", "create", "update", "publish"] },
  ];
  assert.equal(
    (await request("/api/admin/news", "POST", { title: "", status: "draft" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/admin/news", "POST", {
        title: "Bad",
        status: "published",
      })
    ).status,
    400,
  );
  response = await request("/api/admin/news", "POST", {
    title: "A real draft",
    status: "draft",
  });
  assert.equal(response.status, 201);
  let doc = await response.json();
  assert.equal((await request(`/api/news/${doc._id}`)).status, 404);
  const article = {
    ...doc,
    category: "Review sách",
    cover: "https://example.test/cover.jpg",
    content: "<h2>Book review</h2><p>Content</p>",
    slug: "book-review",
    status: "published",
  };
  permissions = [{ module: "content", actions: ["view", "create", "update"] }];
  assert.equal(
    (await request(`/api/admin/news/${doc._id}`, "PUT", article)).status,
    403,
  );
  permissions = [
    { module: "content", actions: ["view", "create", "update", "publish"] },
  ];
  response = await request(`/api/admin/news/${doc._id}`, "PUT", article);
  assert.equal(response.status, 200);
  doc = await response.json();
  assert.equal((await request(`/api/news/${doc._id}`)).status, 200);
  assert.equal(
    (await request(`/api/admin/news/${doc._id}`, "PUT", article)).status,
    409,
  );
  const list = await (
    await request("/api/admin/news?search=real&status=published&limit=1")
  ).json();
  assert.equal(list.total, 1);
  assert.equal(list.items.length, 1);
  assert.equal(list.stats.published, 1);
  response = await request(`/api/admin/news/${doc._id}`, "PUT", {
    ...doc,
    status: "hidden",
  });
  assert.equal(response.status, 200);
  assert.equal((await request(`/api/news/${doc._id}`)).status, 404);
  response = await request("/api/admin/news", "POST", {
    ...article,
    _id: undefined,
    status: "scheduled",
    publishedAt: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(response.status, 201);
  const scheduled = await response.json();
  assert.equal((await request(`/api/news/${scheduled._id}`)).status, 404);
  records.find((d) => String(d._id) === scheduled._id).publishedAt = new Date(
    Date.now() - 1000,
  );
  assert.equal((await request(`/api/news/${scheduled._id}`)).status, 200);
  assert.equal(
    (await (await request(`/api/admin/news/${scheduled._id}`)).json()).status,
    "published",
  );
  assert.equal(
    (await (await request("/api/news?search=missing")).json()).total,
    0,
  );
  assert.equal(
    (
      await request("/api/admin/news", "POST", {
        ...article,
        status: "scheduled",
        publishedAt: "bad",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/admin/news", "POST", {
        ...article,
        cover: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(`/api/admin/news/${new ObjectId()}`)).status,
    404,
  );
  const legacy = {
    _id: new ObjectId(),
    title: "Legacy",
    cover: "data:image/jpeg;base64," + "A".repeat(150000),
    img: "data:image/jpeg;base64,old",
    updatedAt: new Date(),
    status: "draft",
    category: "Review sách",
    content: "<p>Legacy</p>",
  };
  records.push(legacy);
  response = await request(`/api/admin/news/${legacy._id}`, "PUT", {
    title: "Edited legacy",
    status: "draft",
    content: "<p>Updated</p>",
    category: "Review sách",
    updatedAt: legacy.updatedAt.toISOString(),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cover, legacy.cover);
  assert.equal(legacy.img, "data:image/jpeg;base64,old");
  response = await request(`/api/admin/news/${legacy._id}`, "PUT", {
    title: "Cover removed",
    status: "draft",
    content: "<p>Preserved content</p>",
    category: "Review sách",
    cover: "",
    updatedAt: legacy.updatedAt.toISOString(),
  });
  assert.equal(response.status, 200);
  const withoutCover = await response.json();
  assert.equal(withoutCover.cover, "");
  assert.equal(withoutCover.img, "");
  const reloaded = await (
    await request(`/api/admin/news/${legacy._id}`)
  ).json();
  assert.equal(reloaded.cover, "");
  assert.equal(reloaded.img, "");
  for (const date of [
    "2099-02-30T08:00:00.000Z",
    "2099-01-01T24:00:00Z",
    "2099-01-01",
    4102444800000,
  ]) {
    assert.equal(
      (
        await request("/api/admin/news", "POST", {
          ...article,
          status: "scheduled",
          publishedAt: date,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request("/api/admin/news", "POST", {
        ...article,
        status: "draft",
        content: { text: "Wrong input type" },
      })
    ).status,
    400,
  );
  const future = {
    ...article,
    _id: new ObjectId(),
    id: "future-private",
    title: "Private future publication",
    status: "published",
    publishedAt: new Date("2099-01-01T00:00:00Z"),
  };
  records.push(future);
  assert.equal((await request(`/api/news/${future._id}`)).status, 404);
  assert.equal(
    (
      await (
        await request("/api/news?search=Private%20future%20publication")
      ).json()
    ).total,
    0,
  );
  assert.equal(
    (await (await request(`/api/admin/news/${future._id}`)).json()).status,
    "scheduled",
  );
  const brokenSchedule = {
    ...article,
    _id: new ObjectId(),
    status: "scheduled",
    publishedAt: null,
  };
  records.push(brokenSchedule);
  assert.equal((await request(`/api/news/${brokenSchedule._id}`)).status, 404);
  assert.equal(
    (await (await request(`/api/admin/news/${brokenSchedule._id}`)).json())
      .status,
    "scheduled",
  );
  const legacyPublished = {
    ...article,
    _id: new ObjectId(),
    status: "published",
  };
  delete legacyPublished.publishedAt;
  records.push(legacyPublished);
  assert.equal((await request(`/api/news/${legacyPublished._id}`)).status, 200);
});
