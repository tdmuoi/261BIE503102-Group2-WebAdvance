// Existing singleton in collection settings. No upsert, seed, index or secret exposure.
const express = require("express");
const createAuth = require("../middleware/admin-auth");
const revisions = require('../middleware/admin-revision');
const FIELDS = {
  storeName: ["storeName", "text", 120],
  slogan: ["slogan", "text", 240],
  supportEmail: ["supportEmail", "email", 254],
  hotline: ["hotline", "phone", 30],
  logoUrl: ["logoUrl", "url", 2000],
  language: ["language", "choice", ["Vietnamese", "English"]],
  currency: ["currency", "choice", ["VND"]],
  timezone: ["timezone", "choice", ["Asia/Ho_Chi_Minh"]],
  shippingFee: ["shipping.standardFee", "integer", 0, 10000000],
  freeShippingThreshold: [
    "shipping.freeShippingThreshold",
    "integer",
    0,
    1000000000,
  ],
  processingDays: ["shipping.processingDays", "choice", ["1-2", "2-3", "3-5"]],
  carriers: [
    "shipping.carriers",
    "list",
    ["GHN", "GHTK", "VIETTEL_POST", "LIGHTBOOK"],
  ],
  formats: ["ebook.formats", "list", ["PDF", "EPUB", "MOBI"]],
  freePreviewLimit: ["freePreviewLimit", "integer", 0, 1000],
  deviceLimit: ["ebook.deviceLimit", "integer", 1, 100],
  maxEbooksPerOrder: ["ebook.maxPerOrder", "integer", 1, 1000],
};
const unsupported = new Set([
  "payments",
  "vnpayConnected",
  "momoConnected",
  "email",
  "security",
  "blockDownload",
  "watermark",
  "autoAddToShelf",
]);
const get = (doc, path) =>
  path.split(".").reduce((obj, part) => obj?.[part], doc);
const revision = (doc) =>
  doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null;
function present(doc) {
  const values = Object.fromEntries(
    Object.entries(FIELDS).map(([name, [path, kind]]) => [
      name,
      get(doc, path) ?? (kind === "integer" ? null : kind === "list" ? [] : ""),
    ]),
  );
  const paymentMethods = [
    {
      id: "vnpay",
      name: "Cổng VNPay",
      configured:
        typeof doc.vnpayConnected === "boolean" ? doc.vnpayConnected : null,
      description: "Thẻ ATM nội địa, QR ngân hàng",
    },
    {
      id: "momo",
      name: "Ví MoMo",
      configured:
        typeof doc.momoConnected === "boolean" ? doc.momoConnected : null,
      description: "Thanh toán qua ví điện tử",
    },
    {
      id: "zalopay",
      name: "Ví ZaloPay",
      configured: null,
      description: "Thanh toán qua ví điện tử",
    },
    {
      id: "bank",
      name: "Chuyển khoản ngân hàng",
      configured: null,
      description: "Thông tin tài khoản và nội dung chuyển khoản",
    },
    {
      id: "cod",
      name: "Thanh toán khi nhận hàng (COD)",
      configured: null,
      description: "Không áp dụng cho Ebook",
    },
  ];
  for (const method of paymentMethods) Object.assign(method, { connected: false, verified: false });
  return {
    id: String(doc._id),
    revision: revision(doc),
    values,
    paymentMethods,
    updatedBy:
      typeof doc.updatedBy?.name === "string" ? doc.updatedBy.name : null,
    storageOnly: false,
    notice:
      "Backend đặt đơn và kiểm tra voucher đã lấy phí giao tiêu chuẩn/ngưỡng miễn phí từ Settings. Website cần kết nối GET /api/settings để đồng bộ giá xem trước và thông tin cửa hàng. Thông số Ebook chỉ được lưu; chưa kết nối trình đọc. Cổng thanh toán chưa kết nối hoặc xác minh nhà cung cấp.",
    unsupported: [
      "payments",
      "email",
      "security",
      "blockDownload",
      "watermark",
      "autoAddToShelf",
      "logoUpload",
    ],
  };
}
function validate(name, value) {
  const [, kind, option, max] = FIELDS[name];
  if (kind === "integer")
    return Number.isSafeInteger(value) && value >= option && value <= max;
  if (kind === "choice")
    return typeof value === "string" && option.includes(value);
  if (kind === "list")
    return (
      Array.isArray(value) &&
      value.length <= option.length &&
      value.every((v) => typeof v === "string" && option.includes(v)) &&
      new Set(value).size === value.length
    );
  if (
    typeof value !== "string" ||
    value.length > option ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return false;
  if (name === "storeName" && !value.trim()) return false;
  if (kind === "email")
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (kind === "phone") return !value || (/^\+?[()\d .-]+$/.test(value) && /^\d{6,15}$/.test(value.replace(/\D/g, '')));
  if (kind === "url") {
    if (!value) return true;
    if (/\s|\\/.test(value)) return false;
    if (/^\/(?!\/)/.test(value)) return true;
    if (!/^https?:\/\//i.test(value)) return false;
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
    catch { return false; }
  }
  return true;
}
module.exports = function settingsRoutes(getDb) {
  const router = express.Router();
  const auth = createAuth(getDb);
  router.use(auth.cors, auth.requireAdmin);
  router.use((req, res, next) =>
    auth.requirePermission(
      "settings",
      ["GET", "HEAD"].includes(req.method) ? "view" : "update",
    )(req, res, next),
  );
  async function singleton(res) {
    const docs = await getDb()
      .collection("settings")
      .find(
        {},
        {
          projection: {
            _id: 1,
            updatedAt: 1,
            updatedBy: 1,
            isDemo: 1,
            vnpayConnected: 1,
            momoConnected: 1,
            ...Object.fromEntries(
              Object.values(FIELDS).map(([path]) => [path, 1]),
            ),
          },
        },
      )
      .limit(2)
      .toArray();
    if (docs.length !== 1) {
      res.status(409).json({
        message:
          "Settings phải có đúng một document. API không tự tạo hoặc chọn ngẫu nhiên cấu hình.",
      });
      return null;
    }
    return docs[0];
  }
  router.get("/", async (req, res) => {
    try {
      const doc = await singleton(res);
      if (doc) res.json(present(doc));
    } catch {
      res.status(503).json({ message: "Không tải được cấu hình từ MongoDB." });
    }
  });
  router.patch("/", async (req, res) => {
    try {
      const changes = req.body?.changes;
      if (
        !changes ||
        typeof changes !== "object" ||
        Array.isArray(changes) ||
        !Object.keys(changes).length
      )
        return res.status(400).json({ message: "Không có thay đổi hợp lệ." });
      const patch = {};
      for (const [name, raw] of Object.entries(changes)) {
        const value = typeof raw === 'string' ? raw.trim() : raw;
        if (unsupported.has(name))
          return res.status(501).json({
            message:
              "Chức năng này chưa có Backend thực thi. Chưa lưu thay đổi.",
          });
        if (!Object.hasOwn(FIELDS, name) || !validate(name, value))
          return res
            .status(400)
            .json({ message: `Trường ${name} không hợp lệ.`, field: name });
        patch[FIELDS[name][0]] =
          typeof value === "string" ? value.trim() : value;
      }
      const doc = await singleton(res);
      if (!doc) return;
      if (doc.isDemo === true) return res.status(409).json({ message: 'Settings demo chỉ được xem; chưa lưu thay đổi.' });
      if (
        !Object.hasOwn(req.body, "revision") ||
        req.body.revision !== revision(doc)
      )
        return res
          .status(409)
          .json({ message: "Cấu hình đã thay đổi. Tải lại trước khi lưu." });
      patch.updatedAt = revisions.nextUpdatedAt(doc);
      patch.updatedBy = { id: req.admin._id, name: req.admin.fullName };
      const filter = {
        _id: doc._id,
        updatedAt: Object.hasOwn(doc, "updatedAt")
          ? doc.updatedAt
          : { $exists: false },
      };
      const result = await getDb()
        .collection("settings")
        .updateOne(filter, { $set: patch });
      if (!result.matchedCount)
        return res.status(409).json({
          message: "Cấu hình vừa được cập nhật. Tải lại trước khi lưu.",
        });
      // Apply the allowlisted patch to the projected document; never return unrelated secrets.
      for (const [path, value] of Object.entries(patch)) {
        const parts = path.split(".");
        let target = doc;
        for (const part of parts.slice(0, -1)) target = target[part] ||= {};
        target[parts.at(-1)] = value;
      }
      res.json(present(doc));
    } catch {
      res.status(503).json({
        message:
          "Không lưu được cấu hình. Hãy tải lại để kiểm tra trước khi thử tiếp.",
      });
    }
  });
  return router;
};

// Shared read policy: never expose a raw settings document or integration secrets.
async function publicSettings(db, session) {
  const projection = Object.fromEntries(['_id', 'isDemo', 'storeName', 'slogan', 'supportEmail', 'hotline', 'logoUrl',
    'language', 'currency', 'timezone', 'shipping.standardFee', 'shipping.freeShippingThreshold'].map(key => [key, 1]));
  const docs = await db.collection('settings').find({}, { projection, session }).limit(2).toArray();
  if (docs.length > 1 || docs[0]?.isDemo === true) throw Object.assign(new Error('Settings chưa có cấu hình duy nhất hợp lệ.'), { status: 503 });
  const doc = docs[0] || {};
  const values = {};
  for (const name of ['storeName', 'slogan', 'supportEmail', 'hotline', 'logoUrl', 'language', 'currency', 'timezone']) {
    const value = doc[name];
    values[name] = value == null || value === '' ? '' : validate(name, value) ? value : '';
  }
  const shipping = { standardFee: 30000, expressFee: 45000, freeShippingThreshold: 500000 };
  for (const [name, field] of [['shippingFee', 'standardFee'], ['freeShippingThreshold', 'freeShippingThreshold']]) {
    const value = doc.shipping?.[field];
    if (value == null) continue; // Keep existing checkout defaults until explicitly configured.
    if (!validate(name, value)) throw Object.assign(new Error(`Settings ${name} chưa hợp lệ; chưa tính phí đơn hàng.`), { status: 503 });
    shipping[field] = value;
  }
  return { ...values, shipping };
}
module.exports.publicSettings = publicSettings;
module.exports.publicRoutes = function publicSettingsRoutes(getDb) {
  const router = express.Router();
  router.get('/settings', async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await publicSettings(getDb())); }
    catch (error) { next(error); }
  });
  return router;
};
