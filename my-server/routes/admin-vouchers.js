// Registered in index.js using the existing database connection:
// const adminVouchersRoutes = require('./routes/admin-vouchers');
// app.use('/api/admin', adminVouchersRoutes(() => database));
// No indexes, demo data, or changes to other collections are made here.
// Auth is enforced here even if this router is mounted without a separate auth wrapper.
const express = require("express");
const { ObjectId } = require("mongodb");
const createAdminAuth = require("../middleware/admin-auth");

const TYPES = ["percent", "amount", "shipping"];
const STATES = ["active", "paused", "scheduled", "expired"];
const DAY_MS = 86400000;
const text = (value) => (typeof value === "string" ? value.trim() : "");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class ValidationError extends Error {
  constructor(errors) {
    super("Invalid voucher data");
    this.errors = errors;
  }
}

function vietnamDay(date) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

function parseDay(value, endOfDay = false) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`,
  );
  return Number.isFinite(date.getTime()) && vietnamDay(date) === value
    ? date
    : null;
}

function stateOf(doc, now = new Date()) {
  if (doc.endAt < now || (doc.usedCount ?? 0) >= doc.usageLimit)
    return "expired";
  if (doc.status === "inactive") return "paused";
  return doc.startAt > now ? "scheduled" : "active";
}

function present(doc, now = new Date()) {
  return {
    _id: String(doc._id),
    code: doc.code,
    name: doc.name,
    description: doc.description,
    type: {
      percentage: "percent",
      percent: "percent",
      fixed: "amount",
      free_shipping: "shipping",
    }[doc.type],
    value: doc.value,
    maxDiscount: doc.maxDiscount,
    minOrder: doc.minOrderValue,
    limit: doc.usageLimit,
    perCustomer: doc.perUserLimit,
    categories: [],
    newOnly: false,
    suggest: false,
    paused: doc.status === "inactive",
    start: vietnamDay(doc.startAt),
    end: vietnamDay(doc.endAt),
    used: doc.usedCount ?? 0,
    isDemo: doc.isDemo === true,
    state: stateOf(doc, now),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
function storage(data, existing) {
  const dateValue = (field, day) =>
    existing && vietnamDay(existing[field]) === vietnamDay(day)
      ? existing[field]
      : day;
  const type = {
    percent: "percentage",
    amount: "fixed",
    shipping: "free_shipping",
  }[data.type];
  return {
    code: data.code,
    name: data.name,
    description: data.description,
    type:
      existing?.type === "percent" && data.type === "percent"
        ? "percent"
        : type,
    value: data.value,
    maxDiscount: data.maxDiscount,
    minOrderValue: data.minOrder,
    usageLimit: data.limit,
    perUserLimit: data.perCustomer,
    startAt: dateValue("startAt", data.startAt),
    endAt: dateValue("endAt", data.endAt),
    status: data.paused ? "inactive" : "active",
  };
}

function parseVoucher(body, used = 0) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ValidationError({ body: "Cần gửi một đối tượng JSON." });
  const code = text(body.code).toUpperCase();
  const description = text(body.description);
  const name = text(body.name);
  if (!name || name.length > 120)
    errors.name = "Tên ưu đãi từ 1 đến 120 ký tự.";
  const startAt = parseDay(body.start);
  const endAt = parseDay(body.end, true);
  if (!/^[A-Z0-9_-]{3,24}$/.test(code))
    errors.code = "Mã gồm 3–24 chữ không dấu, số, _ hoặc -.";
  if (description.length > 160) errors.description = "Mô tả tối đa 160 ký tự.";
  if (!TYPES.includes(body.type)) errors.type = "Loại giảm giá không hợp lệ.";
  if (
    !Number.isFinite(body.value) ||
    body.value < 1 ||
    (body.type === "percent" && body.value > 100) ||
    (body.type !== "percent" && !Number.isSafeInteger(body.value))
  )
    errors.value =
      "Phần trăm từ 1 đến 100; số tiền phải là số nguyên VND từ 1 trở lên.";
  for (const key of ["maxDiscount", "minOrder"]) {
    if (!Number.isSafeInteger(body[key]) || body[key] < 0)
      errors[key] = "Số tiền phải là số nguyên VND từ 0 trở lên.";
  }
  for (const key of ["limit", "perCustomer"]) {
    if (!Number.isSafeInteger(body[key]) || body[key] < 1)
      errors[key] = "Lượt sử dụng phải là số nguyên dương.";
  }
  if (body.limit < used)
    errors.limit = "Tổng lượt không được nhỏ hơn số lượt đã dùng.";
  if (body.perCustomer > body.limit)
    errors.perCustomer = "Lượt mỗi khách không được vượt tổng lượt.";
  if (
    body.categories !== undefined &&
    (!Array.isArray(body.categories) || body.categories.length)
  )
    errors.categories = "Schema hiện tại chưa hỗ trợ giới hạn theo nhóm sách.";
  if (body.newOnly === true || body.suggest === true)
    errors.options =
      "Schema hiện tại chưa hỗ trợ khách hàng mới hoặc gợi ý giỏ hàng.";
  for (const key of ["paused", "newOnly", "suggest"]) {
    if (typeof body[key] !== "boolean")
      errors[key] = "Giá trị phải là true hoặc false.";
  }
  if (!startAt) errors.start = "Ngày bắt đầu không hợp lệ (YYYY-MM-DD).";
  if (!endAt || (startAt && endAt < startAt))
    errors.end = "Ngày kết thúc phải hợp lệ và không trước ngày bắt đầu.";
  for (const key of [
    "used",
    "usedCount",
    "revenue",
    "discount",
    "state",
    "_id",
    "id",
  ]) {
    if (Object.hasOwn(body, key))
      errors[key] = "Trường này không được cập nhật từ form Admin.";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    code,
    name,
    description,
    type: body.type,
    value: body.value,
    maxDiscount: body.maxDiscount,
    minOrder: body.minOrder,
    limit: body.limit,
    perCustomer: body.perCustomer,
    categories: [],
    newOnly: body.newOnly,
    suggest: body.suggest,
    paused: body.paused,
    startAt,
    endAt,
  };
}

function statusFilters(now) {
  const remaining = {
    $expr: { $lt: [{ $ifNull: ["$usedCount", 0] }, "$usageLimit"] },
  };
  const eligible = { endAt: { $gte: now }, ...remaining };
  return {
    active: { ...eligible, status: "active", startAt: { $lte: now } },
    paused: { ...eligible, status: "inactive" },
    scheduled: { ...eligible, status: "active", startAt: { $gt: now } },
    expired: {
      $or: [
        { endAt: { $lt: now } },
        { $expr: { $gte: [{ $ifNull: ["$usedCount", 0] }, "$usageLimit"] } },
      ],
    },
  };
}

function handleError(res, error) {
  if (error instanceof ValidationError)
    return res
      .status(400)
      .json({ message: "Dữ liệu chưa hợp lệ.", errors: error.errors });
  if (error.code === 11000)
    return res.status(409).json({
      message: "Mã voucher đã tồn tại.",
      errors: { code: "Vui lòng chọn mã khác." },
    });
  if (String(error.name).startsWith("Mongo") || error.code === "DB_UNAVAILABLE")
    return res
      .status(503)
      .json({ message: "Không kết nối được cơ sở dữ liệu. Vui lòng thử lại." });
  return res
    .status(500)
    .json({ message: "Không xử lý được voucher. Vui lòng thử lại." });
}

module.exports = function adminVouchersRoutes(getDb, options) {
  const router = express.Router();
  const auth = createAdminAuth(getDb, options);
  router.use("/vouchers", auth.cors, auth.requireAdmin);
  router.use("/vouchers", (req, res, next) =>
    auth.requirePermission(
      "vouchers",
      ["GET", "HEAD"].includes(req.method)
        ? "view"
        : req.method === "POST"
          ? "create"
          : "update",
    )(req, res, next),
  );
  router.use("/vouchers", async (req, res, next) => {
    try {
      const db = getDb();
      const existing =
        db &&
        (await db
          .listCollections({ name: "vouchers" }, { nameOnly: true })
          .toArray());
      if (!existing?.length)
        return res.status(503).json({
          message:
            "Collection vouchers chưa tồn tại. Cần nhóm cho phép tạo trước; API không tự tạo collection.",
        });
      next();
    } catch (error) {
      handleError(res, error);
    }
  });
  const vouchers = () => {
    const db = getDb();
    if (!db) {
      const error = new Error("Database unavailable");
      error.code = "DB_UNAVAILABLE";
      throw error;
    }
    return db.collection("vouchers");
  };
  async function findVoucher(id) {
    return /^[a-f\d]{24}$/i.test(id)
      ? vouchers().findOne({ _id: new ObjectId(id) })
      : null;
  }
  async function duplicate(code, excludeId) {
    return vouchers().findOne({
      code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
  }

  router.get("/vouchers", async (req, res) => {
    try {
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      const limit = req.query.limit === undefined ? 6 : Number(req.query.limit);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)
      )
        return res.status(400).json({
          message: "page phải là số nguyên dương; limit từ 1 đến 100.",
        });
      if (
        (req.query.q !== undefined && typeof req.query.q !== "string") ||
        text(req.query.q).length > 160
      )
        return res
          .status(400)
          .json({ message: "Từ khoá tìm kiếm tối đa 160 ký tự." });
      const status = req.query.status ?? "all";
      if (status !== "all" && !STATES.includes(status))
        return res.status(400).json({ message: "Trạng thái không hợp lệ." });
      const now = new Date();
      const states = statusFilters(now);
      const q = text(req.query.q);
      const base = q
        ? {
            $or: ["code", "description"].map((key) => ({
              [key]: { $regex: escapeRegex(q), $options: "i" },
            })),
          }
        : {};
      const filter = { $and: [base, status === "all" ? {} : states[status]] };
      const collection = vouchers();
      const counts = Object.fromEntries(
        await Promise.all(
          ["all", ...STATES].map(async (key) => [
            key,
            await collection.countDocuments({
              $and: [base, key === "all" ? {} : states[key]],
            }),
          ]),
        ),
      );
      const total = counts[status];
      const currentPage = Math.min(page, Math.max(1, Math.ceil(total / limit)));
      const deadline = parseDay(
        vietnamDay(new Date(now.getTime() + 7 * DAY_MS)),
        true,
      );
      const [items, active, expiring, usage, demoCount] = await Promise.all([
        collection
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((currentPage - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(states.active),
        collection.countDocuments({
          $and: [states.active, { endAt: { $lte: deadline } }],
        }),
        collection
          .aggregate([{ $group: { _id: null, total: { $sum: "$usedCount" } } }])
          .toArray(),
        collection.countDocuments({ isDemo: true }),
      ]);
      res.json({
        items: items.map((doc) => present(doc, now)),
        total,
        page: currentPage,
        limit,
        counts,
        summary: {
          active,
          expiring,
          totalUses: usage[0]?.total ?? 0,
          revenue: null,
          discount: null,
        },
        asOf: now.toISOString(),
        capabilities: { categories: false, newOnly: false, suggest: false },
        dataNote: `MongoDB có ${demoCount} bản ghi được đánh dấu isDemo; giữ nguyên dữ liệu của nhóm.`,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Reserved path MUST be registered before /:id. No guessed statistics from order discounts.
  router.get("/vouchers/report", async (req, res) => {
    try {
      await vouchers().countDocuments({});
      res.json({
        dataAvailable: false,
        items: [],
        totalUses: null,
        revenue: null,
        discount: null,
        message:
          "Chưa có dữ liệu báo cáo đáng tin cậy: quy trình đặt hàng chưa tích hợp ghi nhận sử dụng voucher.",
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/vouchers/:id", async (req, res) => {
    try {
      const doc = await findVoucher(req.params.id);
      if (!doc)
        return res.status(404).json({ message: "Không tìm thấy voucher." });
      res.json(present(doc));
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/vouchers", async (req, res) => {
    try {
      const data = parseVoucher(req.body);
      if (await duplicate(data.code))
        return res.status(409).json({
          message: "Mã voucher đã tồn tại.",
          errors: { code: "Vui lòng chọn mã khác." },
        });
      const now = new Date();
      const doc = {
        ...storage(data),
        usedCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const result = await vouchers().insertOne(doc);
      res.status(201).json(present({ ...doc, _id: result.insertedId }, now));
    } catch (error) {
      handleError(res, error);
    }
  });

  router.put("/vouchers/:id", async (req, res) => {
    try {
      const existing = await findVoucher(req.params.id);
      if (!existing)
        return res.status(404).json({ message: "Không tìm thấy voucher." });
      const data = parseVoucher(req.body, existing.usedCount ?? 0);
      if (await duplicate(data.code, existing._id))
        return res.status(409).json({
          message: "Mã voucher đã tồn tại.",
          errors: { code: "Vui lòng chọn mã khác." },
        });
      const result = await vouchers().updateOne(
        {
          _id: existing._id,
          $expr: { $lte: [{ $ifNull: ["$usedCount", 0] }, data.limit] },
        },
        { $set: { ...storage(data, existing), updatedAt: new Date() } },
      );
      if (!result.matchedCount)
        return res.status(409).json({
          message: "Voucher đã thay đổi. Vui lòng tải lại trước khi sửa.",
        });
      const updated = await findVoucher(req.params.id);
      if (!updated)
        return res.status(404).json({ message: "Không tìm thấy voucher." });
      res.json(present(updated));
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch("/vouchers/:id/status", async (req, res) => {
    try {
      if (
        !req.body ||
        typeof req.body.paused !== "boolean" ||
        Object.keys(req.body).some((key) => key !== "paused")
      )
        return res
          .status(400)
          .json({ message: "Chỉ gửi { paused: true | false }." });
      const existing = await findVoucher(req.params.id);
      if (!existing)
        return res.status(404).json({ message: "Không tìm thấy voucher." });
      const now = new Date();
      const state = stateOf(existing, now);
      if (state === "expired")
        return res.status(409).json({
          message:
            "Voucher hết hạn hoặc hết lượt. Hãy sửa thời gian / giới hạn trước.",
        });
      const result = await vouchers().updateOne(
        { _id: existing._id, ...statusFilters(now)[state] },
        {
          $set: {
            status: req.body.paused ? "inactive" : "active",
            updatedAt: now,
          },
        },
      );
      if (!result.matchedCount)
        return res
          .status(409)
          .json({ message: "Voucher đã thay đổi. Vui lòng tải lại." });
      const updated = await findVoucher(req.params.id);
      if (!updated)
        return res.status(404).json({ message: "Không tìm thấy voucher." });
      res.json(present(updated));
    } catch (error) {
      handleError(res, error);
    }
  });
  return router;
};
