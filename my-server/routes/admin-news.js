const express = require("express");
const { ObjectId } = require("mongodb");
const createAuth = require("../middleware/admin-auth");
const {
  effectiveStatusExpression,
  presentStatus,
  parseSchedule,
} = require("./news-policy");
const text = (value) => (typeof value === "string" ? value.trim() : "");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const key = (id) => (ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id });

module.exports = function adminNews(getDb) {
  const router = express.Router();
  const auth = createAuth(getDb);
  const news = () => getDb().collection("news");
  const effectiveStatus = () => ({
    $set: { status: effectiveStatusExpression() },
  });
  router.use(auth.cors, auth.requireAdmin);
  router.use((req, res, next) =>
    auth.requirePermission(
      "content",
      ["GET", "HEAD"].includes(req.method)
        ? "view"
        : req.method === "POST"
          ? "create"
          : "update",
    )(req, res, next),
  );
  function mayPublish(req, res) {
    let allowed = false;
    auth.requirePermission("content", "publish")(req, res, () => {
      allowed = true;
    });
    return allowed;
  }
  router.get("/", async (req, res) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = text(req.query.status);
      if (req.query.category) filter.category = text(req.query.category);
      if (text(req.query.search)) {
        const pattern = new RegExp(
          escape(text(req.query.search).slice(0, 200)),
          "i",
        );
        filter.$or = [{ title: pattern }, { desc: pattern }];
      }
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const skip = Math.max(0, parseInt(req.query.skip) || 0);
      const [items, total, categories, groups] = await Promise.all([
        news()
          .aggregate([
            effectiveStatus(),
            { $match: filter },
            { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: limit },
            { $project: { content: 0 } },
          ])
          .toArray(),
        news()
          .aggregate([
            effectiveStatus(),
            { $match: filter },
            { $count: "total" },
          ])
          .toArray(),
        news().distinct("category"),
        news()
          .aggregate([
            effectiveStatus(),
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                views: { $sum: "$views" },
              },
            },
          ])
          .toArray(),
      ]);
      const stats = {
        total: 0,
        draft: 0,
        published: 0,
        scheduled: 0,
        hidden: 0,
        views: 0,
      };
      for (const group of groups) {
        stats.total += group.count;
        stats.views += group.views;
        if (["draft", "published", "scheduled", "hidden"].includes(group._id))
          stats[group._id] = group.count;
      }
      res.json({
        items,
        total: total[0]?.total || 0,
        categories: categories.filter((v) => typeof v === "string" && v).sort(),
        stats,
      });
    } catch {
      res.status(503).json({ message: "Không tải được danh sách từ MongoDB." });
    }
  });
  router.get("/:id", async (req, res) => {
    try {
      const doc = await news().findOne(key(req.params.id));
      if (!doc)
        return res.status(404).json({ message: "Không tìm thấy bài viết." });
      res.json(presentStatus(doc));
    } catch {
      res.status(503).json({ message: "Không tải được bài viết." });
    }
  });
  async function save(req, res) {
    try {
      const body = req.body || {};
      const old = req.params.id
        ? await news().findOne(key(req.params.id))
        : null;
      if (req.params.id && !old)
        return res.status(404).json({ message: "Không tìm thấy bài viết." });
      const doc = {};
      for (const [field, max] of Object.entries({
        title: 240,
        desc: 1000,
        content: 200000,
        category: 100,
        cover: 2000,
        slug: 240,
        metaDescription: 160,
      })) {
        if (field === "cover" && old && !Object.hasOwn(body, "cover")) continue;
        if (body[field] !== undefined && typeof body[field] !== "string")
          return res
            .status(400)
            .json({ message: `${field} phải là chuỗi ký tự.` });
        doc[field] = text(body[field]);
        if (doc[field].length > max)
          return res
            .status(400)
            .json({ message: `${field}: tối đa ${max} ký tự.` });
      }
      if (!doc.title)
        return res.status(400).json({ message: "Vui lòng nhập tiêu đề." });
      if (!["draft", "published", "scheduled", "hidden"].includes(body.status))
        return res.status(400).json({ message: "Trạng thái không hợp lệ." });
      doc.status = body.status;
      if (
        ["published", "scheduled"].includes(doc.status) &&
        !mayPublish(req, res)
      )
        return;
      if (
        doc.cover &&
        !/^https?:\/\/[^\s]+$/i.test(doc.cover) &&
        !/^\/(?!\/)[^\s]*$/.test(doc.cover)
      )
        return res.status(400).json({
          message: "Ảnh bìa phải là URL HTTP(S) hoặc đường dẫn /images/.",
        });
      if (doc.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug))
        return res.status(400).json({
          message: "Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.",
        });
      if (
        ["published", "scheduled"].includes(doc.status) &&
        (!doc.category ||
          !(Object.hasOwn(doc, "cover") ? doc.cover : old?.cover || old?.img) ||
          !doc.content.replace(/<[^>]*>/g, "").trim())
      )
        return res
          .status(400)
          .json({ message: "Đăng bài cần chuyên mục, ảnh bìa và nội dung." });
      if (doc.status === "scheduled") {
        const date = parseSchedule(body.publishedAt);
        if (!date || date <= new Date())
          return res
            .status(400)
            .json({ message: "Chọn thời điểm đăng trong tương lai." });
        doc.publishedAt = date;
      }
      if (
        body.tags !== undefined &&
        (!Array.isArray(body.tags) ||
          body.tags.length > 20 ||
          body.tags.some((v) => typeof v !== "string" || v.length > 50))
      )
        return res.status(400).json({
          message: "Tags không hợp lệ (tối đa 20 tags, 50 ký tự/tag).",
        });
      doc.tags = [...new Set((body.tags || []).map(text).filter(Boolean))];
      doc.contentFormat = "html";
      doc.updatedAt = new Date();
      if (req.params.id) {
        // Keep the legacy image alias consistent when the editor explicitly changes/removes a cover.
        // An omitted cover still preserves both original fields, including large Base64 images.
        if (Object.hasOwn(body, "cover") && Object.hasOwn(old, "img"))
          doc.img = doc.cover;
        if (
          ["published", "scheduled"].includes(old.status) &&
          !["published", "scheduled"].includes(doc.status) &&
          !mayPublish(req, res)
        )
          return;
        if (
          body.updatedAt !==
          (old.updatedAt || old.createdAt
            ? new Date(old.updatedAt || old.createdAt).toISOString()
            : "")
        )
          return res.status(409).json({
            message: "Bài viết đã thay đổi. Hãy tải lại trước khi lưu.",
          });
        if (doc.status === "published")
          doc.publishedAt =
            old.publishedAt && new Date(old.publishedAt) <= new Date()
              ? old.publishedAt
              : new Date();
        const result = await news().updateOne(
          {
            _id: old._id,
            ...(old.updatedAt !== undefined
              ? { updatedAt: old.updatedAt }
              : { updatedAt: { $exists: false } }),
          },
          { $set: doc },
        );
        if (!result.matchedCount)
          return res
            .status(409)
            .json({ message: "Bài viết vừa được cập nhật. Hãy tải lại." });
        return res.json(await news().findOne({ _id: old._id }));
      }
      doc.createdAt = new Date();
      doc.views = 0;
      doc.author = { name: req.admin.fullName, role: req.admin.roleName };
      if (doc.status === "published") doc.publishedAt = new Date();
      const result = await news().insertOne(doc);
      res.status(201).json({ ...doc, _id: result.insertedId });
    } catch {
      res.status(503).json({ message: "Không lưu được bài viết vào MongoDB." });
    }
  }
  router.post("/", save);
  router.put("/:id", save);
  return router;
};
