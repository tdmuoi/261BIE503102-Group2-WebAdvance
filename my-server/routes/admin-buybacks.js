const express = require("express");
const { ObjectId } = require("mongodb");
const createAuth = require("../middleware/admin-auth");
const text = (value) => (typeof value === "string" ? value.trim() : "");
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
function present(doc) {
  return {
    id: String(doc._id),
    code: doc.requestCode || String(doc._id),
    title: doc.title || "",
    sender: text(doc.customer?.name),
    phone: String(doc.customer?.phone || ""),
    email: text(doc.customer?.email),
    sellerId: doc.sellerId ? String(doc.sellerId) : null,
    condition: doc.condition || "",
    price: number(doc.suggestedPrice),
    offerPrice: number(doc.offerPrice),
    resalePrice: number(doc.resalePrice),
    quantity: number(doc.quantity),
    shipping: ["branch", "postal"].includes(doc.shipping) ? doc.shipping : null,
    status: doc.status,
    date: doc.createdAt || null,
    cover: doc.image || "",
    coverText: "",
    images: Array.isArray(doc.images)
      ? doc.images.filter((v) => typeof v === "string")
      : [],
    note: text(doc.note),
    adminNote: text(doc.adminNote),
    isDemo: doc.isDemo === true,
    imageIsCatalogCover: doc.imageIsCatalogCover === true,
    conditionVerified: doc.conditionVerified === true,
    photosVerified: doc.photosVerified === true,
    revision: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}
module.exports = function buybackRoutes(getDb) {
  const router = express.Router();
  const auth = createAuth(getDb);
  const collection = () => getDb().collection("liquidation");
  router.use(auth.cors, auth.requireAdmin);
  router.use((req, res, next) =>
    auth.requirePermission(
      "liquidation",
      ["GET", "HEAD"].includes(req.method)
        ? "view"
        : req.body?.action === "reject"
          ? "reject"
          : "approve",
    )(req, res, next),
  );
  router.get("/", async (req, res) => {
    try {
      // Frontend filters the complete current directory. Never silently truncate it.
      const count = await collection().countDocuments({});
      if (count > 5000)
        return res.status(422).json({
          message:
            "Danh sách vượt 5000 yêu cầu. Cần phân trang server trước khi tải.",
        });
      const items = await collection()
        .find({})
        .sort({ createdAt: -1, _id: -1 })
        .toArray();
      res.json({
        items: items.map(present),
        total: items.length,
        notice: `Collection liquidation có ${items.filter((v) => v.isDemo === true).length} bản ghi isDemo, không phải giao dịch thực. Ảnh bìa danh mục không phải ảnh khách gửi. Chưa tích hợp chuyển tiền/email.`,
      });
    } catch {
      res
        .status(503)
        .json({ message: "Không tải được yêu cầu thanh lý từ MongoDB." });
    }
  });
  router.get("/:id", async (req, res) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id))
        return res.status(400).json({ message: "ID yêu cầu không hợp lệ." });
      const doc = await collection().findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!doc)
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu thanh lý." });
      res.json(present(doc));
    } catch {
      res.status(503).json({ message: "Không tải được chi tiết yêu cầu." });
    }
  });
  router.patch("/:id", async (req, res) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id))
        return res.status(400).json({ message: "ID không hợp lệ." });
      const body = req.body || {};
      if (!["approve", "reject", "quote"].includes(body.action))
        return res.status(400).json({
          message:
            "Chỉ hỗ trợ duyệt, từ chối và định giá. Chưa hỗ trợ chuyển tiền hoặc xoá yêu cầu.",
        });
      if (
        Object.keys(body).some(
          (k) =>
            ![
              "action",
              "revision",
              "note",
              "offerPrice",
              "resalePrice",
            ].includes(k),
        )
      )
        return res
          .status(400)
          .json({ message: "Có trường không được phép thay đổi." });
      if (
        body.note !== undefined &&
        (typeof body.note !== "string" || body.note.length > 2000)
      )
        return res.status(400).json({ message: "Ghi chú tối đa 2000 ký tự." });
      if (body.action === "reject" && !text(body.note))
        return res.status(400).json({ message: "Nhập lý do từ chối." });
      if (
        body.action === "quote" &&
        (!Number.isSafeInteger(body.offerPrice) ||
          body.offerPrice < 1 ||
          body.offerPrice > 100000000 ||
          (body.resalePrice !== undefined &&
            (!Number.isSafeInteger(body.resalePrice) ||
              body.resalePrice < body.offerPrice ||
              body.resalePrice > 100000000)))
      )
        return res.status(400).json({
          message:
            "Giá thu mua phải là số nguyên dương, tối đa 100 triệu đồng. Nếu nhập giá bán lại, giá đó không được nhỏ hơn giá thu mua.",
        });
      const doc = await collection().findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!doc)
        return res.status(404).json({ message: "Không tìm thấy yêu cầu." });
      if (
        !Object.hasOwn(body, "revision") ||
        body.revision !== present(doc).revision
      )
        return res
          .status(409)
          .json({ message: "Yêu cầu đã thay đổi. Tải lại trước khi xử lý." });
      if (
        (body.action === "approve" && doc.status !== "pending") ||
        (body.action === "quote" && doc.status !== "reviewing") ||
        (body.action === "reject" &&
          !["pending", "reviewing"].includes(doc.status))
      )
        return res.status(409).json({
          message: "Trạng thái hiện tại không cho phép thao tác này.",
        });
      const patch = { updatedAt: new Date() };
      // Keep the verified schema: append admin notes to the existing note field.
      // Never replace the customer's description or create a new audit collection.
      if (text(body.note)) {
        patch.note = [
          text(doc.note),
          `[Admin ${req.admin.fullName}; ${patch.updatedAt.toISOString()}] ${text(body.note)}`,
        ]
          .filter(Boolean)
          .join("\n");
        if (patch.note.length > 10000)
          return res
            .status(400)
            .json({ message: "Ghi chú quá dài. Chưa lưu thay đổi." });
      }
      if (body.action === "approve") patch.status = "reviewing";
      if (body.action === "reject") patch.status = "rejected";
      if (body.action === "quote") {
        patch.offerPrice = body.offerPrice;
        // Resale price is a client-side estimate, not a verified schema field.
      }
      const result = await collection().updateOne(
        {
          _id: doc._id,
          status: doc.status,
          updatedAt: Object.hasOwn(doc, "updatedAt")
            ? doc.updatedAt
            : { $exists: false },
        },
        { $set: patch },
      );
      if (!result.matchedCount)
        return res
          .status(409)
          .json({ message: "Yêu cầu vừa được người khác xử lý. Hãy tải lại." });
      res.json(present({ ...doc, ...patch }));
    } catch {
      res.status(503).json({
        message:
          "Không lưu được yêu cầu. Tải lại để kiểm tra trước khi thử tiếp.",
      });
    }
  });
  return router;
};
