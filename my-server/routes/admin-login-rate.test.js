// Isolated HTTP fixtures only: no .env, Atlas, provisioning or production counters.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const createAuth = require("../middleware/admin-auth");

test("ADM-16: successful office logins do not exhaust the shared IP failure budget", async (t) => {
  const password = randomBytes(16).toString("hex");
  const hash = await bcrypt.hash(password, 10);
  let email;
  const account = () => ({
    _id: "fixture-admin",
    email,
    roleCode: "SUPER_ADMIN",
    status: "active",
    provider: "local",
    passwordHash: hash,
  });
  const db = {
    collection: (name) =>
      name === "accounts"
        ? {
            find: () => ({
              project: () => ({
                limit: () => ({ toArray: async () => [account()] }),
              }),
            }),
            findOne: async () => account(),
          }
        : {
            findOne: async () =>
              name === "roles"
                ? { code: "SUPER_ADMIN", permissions: [] }
                : { fullName: "Fixture" },
          },
  };
  const auth = createAuth(() => db);
  const app = express();
  app.use(express.json());
  app.use(auth.cors);
  app.post("/login", auth.login);
  app.get("/session", auth.requireAdmin, auth.current);
  app.post("/logout", auth.logout);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function login(name, secret = password) {
    email = `${name}@example.invalid`;
    return fetch(base + "/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost:4201",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: secret, rememberMe: false }),
    });
  }
  let last;
  for (let i = 0; i < 21; i++) {
    last = await login(`employee-${i}`);
    assert.equal(
      last.status,
      200,
      `Successful login ${i + 1} must not be rate-limited`,
    );
  }
  const cookie = last.headers.get("set-cookie").split(";")[0];
  const session = await last.json();
  assert.equal(
    (
      await fetch(base + "/session", {
        headers: { Cookie: cookie, Origin: "http://localhost:4201" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/logout", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://localhost:4201" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/logout", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:4201",
          "X-Admin-CSRF": session.csrfToken,
        },
      })
    ).status,
    204,
  );
  assert.equal(
    (await fetch(base + "/session", { headers: { Cookie: cookie } })).status,
    401,
  );

  for (let i = 0; i < 5; i++)
    assert.equal((await login("bad-account", "incorrect")).status, 401);
  const limited = await login("bad-account");
  assert.equal(limited.status, 429);
  assert.ok(
    Number(limited.headers.get("retry-after")) > 0 &&
      Number(limited.headers.get("retry-after")) <= 900,
  );
  assert.ok(
    limited.headers
      .get("access-control-expose-headers")
      .includes("Retry-After"),
  );
  // A different employee remains usable despite failures for another account.
  assert.equal((await login("another-employee")).status, 200);
  // Twenty actual failures across accounts still protect a shared IP.
  for (let i = 0; i < 15; i++)
    assert.equal((await login(`ip-failure-${i}`, "incorrect")).status, 401);
  assert.equal((await login("ip-blocked-employee")).status, 429);
  const later = Date.now() + 900001;
  t.mock.method(Date, "now", () => later);
  assert.equal((await login("after-window")).status, 200);
});
