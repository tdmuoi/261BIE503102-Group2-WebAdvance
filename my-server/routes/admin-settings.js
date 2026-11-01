// Existing singleton in collection settings. No upsert, seed, index or secret exposure.
const express = require("express");
const createAuth = require("../middleware/admin-auth");
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
  return {
    id: String(doc._id),
    revision: revision(doc),
    values,
    paymentMethods,
    updatedBy:
      typeof doc.updatedBy?.name === "string" ? doc.updatedBy.name : null,
    storageOnly: true,
    notice:
      "Cấu hình được lưu trong MongoDB. Checkout, giao diện cửa hàng và trình đọc Ebook hiện chưa sử dụng API Settings này. Trạng thái cổng thanh toán chỉ phản ánh cấu hình đã lưu, chưa xác minh kết nối nhà cung cấp.",
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
    /[\u0000-\u001f]/.test(value)
  )
    return false;
  if (name === "storeName" && !value.trim()) return false;
  if (kind === "email")
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (kind === "phone") return !value || /^[+()\d .-]{6,30}$/.test(value);
  if (kind === "url")
    return (
      !value ||
      /^https?:\/\/[^\s]+$/i.test(value) ||
      /^\/(?!\/)[^\s]*$/.test(value)
    );
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
      for (const [name, value] of Object.entries(changes)) {
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
      if (
        !Object.hasOwn(req.body, "revision") ||
        req.body.revision !== revision(doc)
      )
        return res
          .status(409)
          .json({ message: "Cấu hình đã thay đổi. Tải lại trước khi lưu." });
      patch.updatedAt = new Date();
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
