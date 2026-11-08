// =====================================================================
// API Đổi trả & hoàn tiền cho my-admin  (gắn vào index.js: app.use('/api/admin', adminReturnsRoutes(() => database)))
// Dữ liệu: collection "return_requests"
//
//   GET   /api/admin/returns              danh sách + lọc + phân trang + thống kê
//           ?q=       mã yêu cầu, mã đơn, tên / SĐT khách
//           ?status=  pending | approved | received | refunded | exchanged | rejected | open (= 3 trạng thái đang xử lý)
//           ?type=    refund | exchange
//           ?from=YYYY-MM-DD&to=YYYY-MM-DD   ngày gửi yêu cầu (giờ VN)
//           ?page=1&limit=10
//   GET   /api/admin/returns/:id          chi tiết + nextStatuses
//   PATCH /api/admin/returns/:id/status   { status, note?, refundAmount?, restock? }
//   PATCH /api/admin/returns/:id          { adminNote }
//
// Luồng xử lý:
//   pending  (Chờ duyệt)        -> approved | rejected
//   approved (Chờ nhận sách)    -> received | rejected
//   received (Đã nhận sách)     -> refunded (type refund) | exchanged (type exchange)
//   refunded / exchanged / rejected: kết thúc
// - Từ chối bắt buộc có lý do (note).
// - Nhận sách: restock = true thì cộng lại tồn kho (sách còn bán được).
// - Hoàn tiền: refundAmount > 0 và không vượt giá trị sách trả; đơn gốc (nếu có) được đánh dấu
//   paymentStatus = 'refunded' và status = 'returned'.
//
// ---------------------------------------------------------------------
// CẤU TRÚC 1 YÊU CẦU — trang "Trả hàng" của web khách nên lưu theo mẫu này:
// {
//   requestCode: 'RR-261028-0001',
//   orderId: ObjectId, orderCode: 'LB-...',
//   userId: ObjectId | null, customer: { name, phone, email },
//   items: [{ bookId, title, image, price, quantity }],     // sách muốn trả
//   type: 'refund' | 'exchange',                            // hoàn tiền hay đổi sách khác
//   reason: 'damaged' | 'wrong_item' | 'not_as_described' | 'missing' | 'changed_mind' | 'other',
//   description: 'mô tả của khách', images: ['url ảnh chụp lỗi'],
//   refundMethod: 'original' | 'bank_transfer', bankInfo: { bankName, accountName, accountNumber } | null,
//   status: 'pending', statusHistory: [{ status, at, note }],
//   refundAmount: null, adminNote: '', createdAt, updatedAt
// }
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');
const revisions = require('../middleware/admin-revision');
const dateRange = require('../middleware/admin-date-range');

const STATUSES = ['pending', 'approved', 'received', 'refunded', 'exchanged', 'rejected'];
const OPEN = ['pending', 'approved', 'received'];
const REASONS = ['damaged', 'wrong_item', 'not_as_described', 'missing', 'changed_mind', 'other'];
const FLOW = {
  pending: ['approved', 'rejected'],
  approved: ['received', 'rejected'],
  received: ['refunded', 'exchanged'],
  refunded: [],
  exchanged: [],
  rejected: [],
};

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
function normalizeStatus(value) {
  const s = String(value ?? '').trim().toLowerCase();
  const aliases = { requested: 'pending', processing: 'approved', completed: 'refunded', done: 'refunded', declined: 'rejected' };
  return STATUSES.includes(s) ? s : aliases[s] || 'pending';
}

/** Đổi document thành dạng thống nhất (đọc được cả vài tên field khác) */
function present(doc) {
  const items = (Array.isArray(doc.items) ? doc.items : doc.bookId ? [doc] : []).map((it) => ({
    bookId: it.bookId ? String(it.bookId) : null,
    title: it.title ?? it.bookTitle ?? it.name ?? '',
    image: it.image ?? null,
    price: toNumber(it.price),
    quantity: toNumber(it.quantity ?? 1) || 1,
  }));
  const itemsValue = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const status = normalizeStatus(doc.status);
  const type = doc.type === 'exchange' ? 'exchange' : 'refund';
  const next = FLOW[status].filter((s) => !(s === 'refunded' && type === 'exchange') && !(s === 'exchanged' && type === 'refund'));
  return {
    _id: String(doc._id),
    requestCode: doc.requestCode ?? doc.code ?? 'RR-' + String(doc._id).slice(-6).toUpperCase(),
    orderId: doc.orderId ? String(doc.orderId) : null,
    orderCode: doc.orderCode ?? '',
    isDemo: doc.isDemo === true,
    userId: doc.userId ? String(doc.userId) : null,
    customer: {
      name: doc.customer?.name ?? doc.customerName ?? 'Khách hàng',
      phone: doc.customer?.phone ?? doc.phone ?? '',
      email: doc.customer?.email ?? doc.email ?? '',
    },
    items,
    itemsValue,
    type,
    reason: REASONS.includes(doc.reason) ? doc.reason : 'other',
    description: doc.description ?? doc.reasonText ?? (REASONS.includes(doc.reason) ? '' : doc.reason ?? ''),
    images: Array.isArray(doc.images) ? doc.images : [],
    refundMethod: doc.refundMethod ?? 'original',
    bankInfo: doc.bankInfo ?? null,
    refundAmount: doc.refundAmount ?? null,
    status,
    nextStatuses: next,
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    adminNote: doc.adminNote ?? '',
    restocked: !!doc.restocked,
    createdAt: toDate(doc.createdAt) ?? (doc._id?.getTimestamp ? doc._id.getTimestamp() : null),
    updatedAt: toDate(doc.updatedAt),
  };
}

module.exports = function adminReturnsRoutes(getDb, getClient) {
  const router = express.Router();
  const returns = () => getDb().collection('return_requests');
  const orders = () => getDb().collection('orders');
  const books = () => getDb().collection('books');

  async function findRequest(id) {
    if (!ObjectId.isValid(id)) return null;
    return returns().findOne({ _id: new ObjectId(String(id)) });
  }

  async function presentOne(doc) {
    const result = present(doc);
    result.restockEligible = false;
    if (doc.isDemo === true || doc.userId == null || !ObjectId.isValid(String(doc.orderId))) return result;
    const order = await orders().findOne({ _id: new ObjectId(String(doc.orderId)) });
    if (!order || order.isDemo === true || String(order.userId) !== String(doc.userId) || order.stockDeducted !== true || order.restocked === true || doc.restocked === true) return result;
    const ids = result.items.map(it => it.bookId).filter(id => ObjectId.isValid(String(id)));
    const documents = ids.length ? await books().find({ _id: { $in: ids.map(id => new ObjectId(id)) } }).toArray() : [];
    result.restockEligible = ids.length === result.items.length && ids.length > 0 && documents.length === new Set(ids).size && documents.every(b => ['new', 'used'].includes(b.bookType));
    return result;
  }

  // ---------- Danh sách + thống kê ----------
  router.get('/returns', async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
      const base = {};
      const q = cleanText(req.query.q);
      if (q) {
        const regex = { $regex: escapeRegex(q), $options: 'i' };
        base.$or = [{ requestCode: regex }, { orderCode: regex }, { 'customer.name': regex }, { 'customer.phone': regex }, { customerName: regex }];
      }
      if (req.query.type === 'refund' || req.query.type === 'exchange') base.type = req.query.type;
      const { from, to } = dateRange(req.query);
      if (from || to) {
        base.createdAt = {};
        if (from) base.createdAt.$gte = from;
        if (to) base.createdAt.$lte = to;
      }

      const statusFilter =
        req.query.status === 'open' ? { status: { $in: OPEN } } : STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
      const listFilter = { ...base, ...statusFilter };

      // Thống kê tính trên toàn bộ yêu cầu khớp ô tìm kiếm / loại / ngày (không theo tab trạng thái)
      const [docs, total, all] = await Promise.all([
        returns().find(listFilter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        returns().countDocuments(listFilter),
        returns().find(base).toArray(),
      ]);
      const presented = all.map(present);
      const counts = { all: presented.length, open: 0 };
      STATUSES.forEach((s) => (counts[s] = 0));
      const reasons = Object.fromEntries(REASONS.map((r) => [r, 0]));
      let refundedTotal = 0;
      for (const r of presented) {
        counts[r.status] += 1;
        if (OPEN.includes(r.status)) counts.open += 1;
        reasons[r.reason] += 1;
        if (r.status === 'refunded') refundedTotal += toNumber(r.refundAmount);
      }

      res.json({
        items: docs.map((d) => {
          const { statusHistory, bankInfo, adminNote, images, ...summary } = present(d);
          return summary;
        }),
        total,
        page,
        limit,
        counts,
        reasons,
        refundedTotal,
      });
    } catch (error) {
      console.error('GET /api/admin/returns failed:', error.message);
      res.status(error.status || 500).json({ message: error.status ? error.message : 'Không tải được danh sách yêu cầu đổi trả' });
    }
  });

  // ---------- Chi tiết ----------
  router.get('/returns/:id', async (req, res) => {
    try {
      const doc = await findRequest(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
      const result = await presentOne(doc);
      // Kèm thông tin đơn gốc (nếu tìm được)
      let order = null;
      if (result.orderId && ObjectId.isValid(result.orderId)) {
        order = await orders().findOne({ _id: new ObjectId(result.orderId) });
      } else if (result.orderCode) {
        order = await orders().findOne({ orderCode: result.orderCode });
      }
      res.json({
        ...result,
        order: order
          ? { _id: String(order._id), orderCode: order.orderCode ?? '', total: toNumber(order.total ?? order.totalAmount), status: order.status, paymentMethod: order.paymentMethod ?? '', createdAt: toDate(order.createdAt) }
          : null,
      });
    } catch (error) {
      console.error('GET /api/admin/returns/:id failed:', error.message);
      res.status(500).json({ message: 'Không tải được yêu cầu' });
    }
  });

  // Safety gate: no mutation of demo/unowned documents. No validator changes.
  router.use('/returns/:id', async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    try {
      const doc = await findRequest(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Not found' });
      if (doc.isDemo === true || doc.userId == null) return res.status(409).json({ message: 'Demo/owner policy is not approved; read only' });
      // Status transitions below require a transactional client.

      return next();
    } catch { return res.status(503).json({ message: 'Cannot verify safe ownership' }); }
  });

  // ---------- Chuyển trạng thái ----------
  router.patch('/returns/:id/status', async (req, res) => {
    try {
      const transition = require('../middleware/admin-safe-status');
      const doc = await transition(getDb(), getClient?.(), 'returns', req.params.id, req.body || {});
      res.json(await presentOne(doc));
    } catch (error) {
      res.status(error.status || 503).json({ message: error.status ? error.message : 'Transaction failed; no partial changes committed' });
    }
  });

  // ---------- Ghi chú nội bộ ----------
  router.patch('/returns/:id', async (req, res) => {
    try {
      const doc = await findRequest(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
      if (typeof req.body?.adminNote !== 'string') return res.status(400).json({ message: 'Cần gửi adminNote' });
      if (Object.keys(req.body).some((key) => !['adminNote', 'revision'].includes(key))) return res.status(400).json({ message: 'Có trường không được phép sửa.' });
      revisions.requireRevision(req.body, doc);
      const result = await returns().updateOne({ _id: doc._id, ...revisions.snapshot(doc) }, { $set: { adminNote: req.body.adminNote.trim().slice(0, 1000), updatedAt: revisions.nextUpdatedAt(doc) } });
      if (!result.matchedCount) throw revisions.conflict();
      res.json(await presentOne(await returns().findOne({ _id: doc._id })));
    } catch (error) {
      console.error('PATCH /api/admin/returns/:id failed:', error.message);
      res.status(error.status || 500).json({ message: error.status ? error.message : 'Không lưu được ghi chú' });
    }
  });

  return router;
};

module.exports.present = present;
