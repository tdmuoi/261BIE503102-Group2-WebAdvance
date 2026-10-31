const {
  randomBytes,
  createHash,
  timingSafeEqual,
  scrypt,
} = require("node:crypto");
const { promisify } = require("node:util");

const derive = promisify(scrypt);
const COOKIE = "lightbook_admin_session";
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const WINDOW = 15 * 60 * 1000;
const IDLE = 30 * 60 * 1000;
// Single Node process only. A restart invalidates sessions; no database writes or indexes.
// Multi-instance hosting requires an approved shared session/rate-limit store.
const sessions = new Map();
const attempts = new Map();
let activeHashes = 0;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const clean = (value) => (typeof value === "string" ? value.trim() : "");

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Offline provisioning helper, not an HTTP registration API. Never writes accounts. */
async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  )
    throw new Error(
      "Password must contain at least 12 characters and at most 72 bytes for bcrypt.",
    );
  return bcryptDriver().hash(password, 12);
}
function bcryptDriver() {
  try {
    return require("bcryptjs");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    const unavailable = new Error(
      "Backend chưa có thư viện xác minh bcrypt. Cần nhóm phê duyệt dependency bcryptjs; không cần đổi mật khẩu hoặc database.",
    );
    unavailable.code = "AUTH_BCRYPT_UNAVAILABLE";
    throw unavailable;
  }
}

async function verifyPassword(password, encoded) {
  if (
    typeof encoded === "string" &&
    /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(encoded)
  ) {
    const bcrypt = bcryptDriver();
    if (Buffer.byteLength(password) > 72) return false;
    const cost = Number(encoded.slice(4, 6));
    if (cost < 10 || cost > 16) return false;
    return bcrypt.compare(password, encoded);
  }
  // Strict cost/format allowlist avoids weak hashes and attacker-controlled memory costs.
  const valid =
    typeof encoded === "string" &&
    /^scrypt\$32768\$8\$3\$[a-f\d]{32}\$[a-f\d]{128}$/.test(encoded);
  const parts = valid ? encoded.split("$") : [];
  const salt = valid ? parts[4] : "00000000000000000000000000000000";
  const key = await derive(password, salt, 64, OPTIONS);
  return valid && same(key.toString("hex"), parts[5]);
}

function allowedAdmin(user) {
  return (
    user?.status === "active" &&
    user.provider === "local" &&
    [
      "SUPER_ADMIN",
      "WAREHOUSE_MANAGER",
      "SALES_MANAGER",
      "CONTENT_MANAGER",
    ].includes(user.roleCode)
  );
}

function safeUser(user) {
  return {
    _id: String(user._id),
    profileId: user.profile?._id ? String(user.profile._id) : null,
    fullName: user.profile?.fullName || "Admin",
    email: user.email,
    role: user.roleCode === "SUPER_ADMIN" ? "superadmin" : "admin",
    roleCode: user.roleCode,
    roleName: user.roleDefinition?.name || user.roleCode,
    permissions: user.roleDefinition?.permissions ?? [],
  };
}

function readSession(req) {
  const cookies = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE.length + 1);
  return /^[a-f\d]{64}$/.test(token) ? digest(token) : null;
}

function cleanup(now) {
  for (const [key, value] of sessions)
    if (value.expires <= now || value.seen + IDLE <= now) sessions.delete(key);
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
}

module.exports = function createAdminAuth(getDb, options = {}) {
  const production = process.env.NODE_ENV === "production";
  const origins = new Set(
    options.allowedOrigins ?? (production ? [] : ["http://localhost:4201"]),
  );
  const accounts = () => {
    const db = getDb();
    if (!db) throw new Error("Database unavailable");
    return db.collection("accounts");
  };
  async function principal(account) {
    if (!allowedAdmin(account)) return null;
    const db = getDb();
    const roleDefinition = await db
      .collection("roles")
      .findOne(
        { code: account.roleCode },
        { projection: { code: 1, name: 1, permissions: 1 } },
      );
    if (
      !roleDefinition ||
      !Array.isArray(roleDefinition.permissions) ||
      roleDefinition.permissions.some(
        (entry) =>
          typeof entry.module !== "string" ||
          !Array.isArray(entry.actions) ||
          entry.actions.some((action) => typeof action !== "string"),
      )
    )
      return null;
    const profile = await db
      .collection("users")
      .findOne({ accountId: account._id }, { projection: { fullName: 1 } });
    return { ...account, profile, roleDefinition };
  }
  function cookieOptions(req) {
    return {
      httpOnly: true,
      sameSite: "strict",
      secure: production || req.secure,
      path: "/api/admin",
    };
  }
  function originAllowed(req) {
    return origins.has(req.get("origin"));
  }
  function cors(req, res, next) {
    res.set("Cache-Control", "no-store");
    if (production && !req.secure)
      return res.status(403).json({ message: "Yêu cầu HTTPS." });
    const origin = req.get("origin");
    if (origin && !originAllowed(req))
      return res
        .status(403)
        .json({ message: "Nguồn truy cập không được phép." });
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") {
      if (!originAllowed(req)) return res.sendStatus(403);
      res.set(
        "Access-Control-Allow-Methods",
        "GET, HEAD, POST, PUT, PATCH, OPTIONS",
      );
      res.set("Access-Control-Allow-Headers", "Content-Type, X-Admin-CSRF");
      return res.sendStatus(204);
    }
    next();
  }
  function response(session, user) {
    return {
      user: safeUser(user),
      csrfToken: session.csrf,
      expiresAt: new Date(
        Math.min(session.expires, session.seen + IDLE),
      ).toISOString(),
    };
  }
  async function requireAdmin(req, res, next) {
    res.set("Cache-Control", "no-store");
    if (production && !req.secure)
      return res.status(403).json({ message: "Yêu cầu HTTPS." });
    const now = Date.now();
    const key = readSession(req);
    const session = key && sessions.get(key);
    if (!session || session.expires <= now || session.seen + IDLE <= now) {
      if (key) sessions.delete(key);
      res.clearCookie(COOKIE, cookieOptions(req));
      return res.status(401).json({
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }
    if (req.get("origin") && !originAllowed(req))
      return res
        .status(403)
        .json({ message: "Nguồn truy cập không được phép." });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!originAllowed(req) || !same(req.get("X-Admin-CSRF"), session.csrf))
    )
      return res.status(403).json({
        message: "Yêu cầu không hợp lệ (CSRF). Vui lòng tải lại trang.",
      });
    try {
      const account = await accounts().findOne(
        { _id: session.userId },
        {
          projection: {
            email: 1,
            roleCode: 1,
            provider: 1,
            status: 1,
            passwordHash: 1,
          },
        },
      );
      const user = await principal(account);
      if (
        !user ||
        digest(String(account.passwordHash)) !== session.passwordVersion
      ) {
        sessions.delete(key);
        res.clearCookie(COOKIE, cookieOptions(req));
        return res.status(403).json({
          message:
            "Tài khoản không còn quyền quản trị hoặc phiên đã bị thu hồi.",
        });
      }
      session.seen = now;
      req.admin = safeUser(user);
      req.adminSession = session;
      next();
    } catch {
      return res.status(503).json({
        message:
          "Không kiểm tra được phiên với cơ sở dữ liệu. Vui lòng thử lại.",
      });
    }
  }
  async function login(req, res) {
    if (!originAllowed(req) || !req.is("application/json"))
      return res
        .status(403)
        .json({ message: "Nguồn hoặc định dạng đăng nhập không hợp lệ." });
    const email = clean(req.body?.email).toLowerCase();
    const password = req.body?.password;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      typeof password !== "string" ||
      !password.length ||
      Buffer.byteLength(password) > 1024 ||
      typeof req.body?.rememberMe !== "boolean"
    )
      return res.status(400).json({
        message: "Email, mật khẩu hoặc lựa chọn ghi nhớ không hợp lệ.",
      });
    const now = Date.now();
    cleanup(now);
    const keys = [
      `email:${digest(email)}`,
      `ip:${digest(req.ip || "unknown")}`,
    ];
    if (
      keys.some(
        (key, i) => (attempts.get(key)?.count ?? 0) >= (i === 0 ? 5 : 20),
      )
    ) {
      res.set("Retry-After", "900");
      return res.status(429).json({
        message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.",
      });
    }
    if (attempts.size >= 10000 || sessions.size >= 10000 || activeHashes >= 2)
      return res
        .status(503)
        .json({ message: "Đăng nhập đang bận. Vui lòng thử lại sau." });
    keys.forEach((key) => {
      const entry = attempts.get(key) ?? { count: 0, until: now + WINDOW };
      entry.count++;
      attempts.set(key, entry);
    });
    activeHashes++;
    try {
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = await accounts()
        .find({ email: { $regex: `^${escaped}$`, $options: "i" } })
        .project({
          email: 1,
          roleCode: 1,
          provider: 1,
          status: 1,
          passwordHash: 1,
        })
        .limit(2)
        .toArray();
      const account = matches.length === 1 ? matches[0] : null;
      const user = await principal(account);
      const correct = await verifyPassword(password, user?.passwordHash);
      if (!correct || !user)
        return res.status(401).json({
          message: "Email, mật khẩu hoặc quyền quản trị không hợp lệ.",
        });
      const old = readSession(req);
      if (old) sessions.delete(old);
      const token = randomBytes(32).toString("hex");
      const duration = req.body.rememberMe ? 7 * 86400000 : 8 * 3600000;
      const session = {
        userId: user._id,
        csrf: randomBytes(32).toString("hex"),
        seen: now,
        expires: now + duration,
        passwordVersion: digest(user.passwordHash),
      };
      sessions.set(digest(token), session);
      attempts.delete(keys[0]);
      res.cookie(COOKIE, token, {
        ...cookieOptions(req),
        ...(req.body.rememberMe ? { maxAge: duration } : {}),
      });
      return res.json(response(session, user));
    } catch (error) {
      if (error.code === "AUTH_BCRYPT_UNAVAILABLE")
        return res
          .status(503)
          .json({ code: error.code, message: error.message });
      return res.status(503).json({
        message: "Không thể xác thực với cơ sở dữ liệu. Vui lòng thử lại.",
      });
    } finally {
      activeHashes--;
    }
  }
  function logout(req, res) {
    if (!originAllowed(req))
      return res.status(403).json({ message: "Nguồn truy cập không hợp lệ." });
    const key = readSession(req);
    const session = key && sessions.get(key);
    if (session && !same(req.get("X-Admin-CSRF"), session.csrf))
      return res
        .status(403)
        .json({ message: "Yêu cầu đăng xuất không hợp lệ (CSRF)." });
    if (key) sessions.delete(key);
    res.clearCookie(COOKIE, cookieOptions(req));
    return res.sendStatus(204);
  }
  return {
    cors,
    requireAdmin,
    login,
    logout,
    requirePermission: (module, action) => (req, res, next) => {
      if (
        req.admin?.role === "superadmin" ||
        req.admin?.permissions?.some(
          (entry) => entry.module === module && entry.actions.includes(action),
        )
      )
        return next();
      return res.status(403).json({
        message: "Vai trò hiện tại chưa được cấp quyền cho thao tác này.",
      });
    },
    current: (req, res) =>
      res.json({
        user: req.admin,
        csrfToken: req.adminSession.csrf,
        expiresAt: new Date(
          Math.min(req.adminSession.expires, req.adminSession.seen + IDLE),
        ).toISOString(),
      }),
  };
};

module.exports.hashPassword = hashPassword;
