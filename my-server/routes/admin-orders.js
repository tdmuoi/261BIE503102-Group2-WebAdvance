// =====================================================================
// API Đơn hàng cho my-admin   (gắn vào index.js: app.use('/api/admin', adminOrdersRoutes(() => database)))
//
//   GET   /api/admin/orders              danh sách + lọc + phân trang
//           ?q=        tìm mã đơn, tên / SĐT / email khách
//           ?status=   pending | confirmed | shipping | delivered | cancelled | returned
//           ?payment=  unpaid | paid | refunded
//           ?from=2026-10-01&to=2026-10-31   (ngày đặt, giờ Việt Nam)
//           ?sort=     newest | oldest | total_desc | total_asc
//           ?page=1&limit=10
//   GET   /api/admin/orders/:id          chi tiết đơn + các trạng thái được phép chuyển tiếp (nextStatuses)
//   PATCH /api/admin/orders/:id/status   { status, note?, trackingCode?, restock? }  chuyển trạng thái
//   PATCH /api/admin/orders/:id          { adminNote?, trackingCode?, paymentStatus? } sửa thông tin phụ
//
// ---------------------------------------------------------------------
// CẤU TRÚC 1 ĐƠN (collection "orders") — trang Thanh toán (my-app) nên lưu theo mẫu này:
// {
//   orderCode: 'LB-261027-0001',
//   userId: ObjectId | null,
//   customer: { name, email, phone },
//   shippingAddress: { fullName, phone, address, ward, district, province } | null (đơn chỉ có ebook),
//   items: [{ bookId, title, image, price, quantity, format: 'print' | 'ebook' }],
//   subtotal, shippingFee, discount, voucherCode, total,
//   paymentMethod: 'cod' | 'bank_transfer' | 'momo' | 'vnpay',
//   paymentStatus: 'unpaid' | 'paid' | 'refunded',
//   status: 'pending' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled' | 'returned',
//   statusHistory: [{ status, at, note }],
//   note (ghi chú của khách), adminNote, trackingCode,
//   stockDeducted: true nếu lúc đặt đã trừ tồn kho (để huỷ đơn thì cộng lại),
//   createdAt, updatedAt
// }
// API đọc được cả vài tên field khác (total/totalAmount, customerName...) nếu dữ liệu cũ đặt khác.
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');

const STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'returned'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

/** Luồng xử lý đơn: trạng thái hiện tại -> được chuyển sang */
const FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  total_desc: { total: -1 },
  total_asc: { total: 1 },
};

// ---------- Hàm phụ ----------
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

/** 'YYYY-MM-DD' theo giờ VN -> Date */
function parseDay(value, endOfDay = false) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(value) {
  const s = String(value ?? '').trim().toLowerCase();
  const aliases = { canceled: 'cancelled', processing: 'confirmed', shipped: 'shipping', completed: 'delivered', refunded: 'returned' };
  return STATUSES.includes(s) ? s : aliases[s] || 'pending';
}

function itemsOf(order) {
  const list = Array.isArray(order.items) ? order.items : Array.isArray(order.products) ? order.products : [];
  return list.map((it) => ({
    bookId: it.bookId ? String(it.bookId) : it.productId ? String(it.productId) : null,
    title: it.title ?? it.name ?? '',
    image: it.image ?? it.img ?? null,
    price: toNumber(it.price),
    quantity: toNumber(it.quantity ?? it.qty ?? 1) || 1,
    format: it.format === 'ebook' || it.type === 'ebook' || it.isEbook ? 'ebook' : 'print',
  }));
}

function totalOf(order, items) {
  for (const key of ['total', 'totalAmount', 'totalPrice', 'grandTotal']) {
    if (order[key] !== undefined && order[key] !== null) return toNumber(order[key]);
  }
  return items.reduce((s, it) => s + it.price * it.quantity, 0) + toNumber(order.shippingFee) - toNumber(order.discount);
}

/** Đổi 1 document thành dạng thống nhất cho admin */
function present(order, user = null) {
  const items = itemsOf(order);
  const address = order.shippingAddress ?? order.shipping ?? order.address ?? null;
  const customer = {
    name: order.customer?.name ?? order.customerName ?? address?.fullName ?? user?.fullName ?? user?.name ?? user?.username ?? 'Khách vãng lai',
    email: order.customer?.email ?? order.email ?? user?.email ?? '',
    phone: order.customer?.phone ?? order.phone ?? address?.phone ?? user?.phone ?? '',
  };
  const subtotal = order.subtotal !== undefined ? toNumber(order.subtotal) : items.reduce((s, it) => s + it.price * it.quantity, 0);
  const status = normalizeStatus(order.status);
  const onlyEbooks = items.length > 0 && items.every((it) => it.format === 'ebook');
  return {
    _id: String(order._id),
    orderCode: order.orderCode ?? order.code ?? '#' + String(order._id).slice(-6).toUpperCase(),
    userId: order.userId ? String(order.userId) : null,
    customer,
    shippingAddress: address,
    items,
    itemCount: items.reduce((s, it) => s + it.quantity, 0),
    onlyEbooks,
    subtotal,
    shippingFee: toNumber(order.shippingFee),
    discount: toNumber(order.discount),
    voucherCode: order.voucherCode ?? null,
    total: totalOf(order, items),
    paymentMethod: order.paymentMethod ?? 'cod',
    paymentStatus: PAYMENT_STATUSES.includes(order.paymentStatus) ? order.paymentStatus : 'unpaid',
    status,
    // Đơn chỉ có ebook không cần giao hàng: xác nhận xong là "Đã giao"
    nextStatuses: onlyEbooks && status === 'confirmed' ? ['delivered', 'cancelled'] : FLOW[status],
    statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
    note: order.note ?? '',
    adminNote: order.adminNote ?? '',
    trackingCode: order.trackingCode ?? '',
    stockDeducted: !!order.stockDeducted,
    restocked: !!order.restocked,
    createdAt: toDate(order.createdAt ?? order.orderDate) ?? (order._id?.getTimestamp ? order._id.getTimestamp() : null),
    updatedAt: toDate(order.updatedAt),
  };
}

module.exports = function adminOrdersRoutes(getDb) {
  const router = express.Router();
  const orders = () => getDb().collection('orders');
  const users = () => getDb().collection('users');
  const books = () => getDb().collection('books');

  async function userMap(list) {
    const ids = [...new Set(list.map((o) => o.userId).filter(Boolean).map(String))].filter((id) => ObjectId.isValid(id));
    if (!ids.length) return new Map();
    const docs = await users().find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }).toArray();
    return new Map(docs.map((u) => [String(u._id), u]));
  }

  async function findOrder(id) {
    if (!ObjectId.isValid(id)) return null;
    return orders().findOne({ _id: new ObjectId(String(id)) });
  }

  async function presentOne(doc) {
    const map = await userMap([doc]);
    return present(doc, map.get(String(doc.userId)));
  }

  // ---------- Danh sách ----------
  router.get('/orders', async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
      const base = {};

      const q = cleanText(req.query.q);
      if (q) {
        const regex = { $regex: escapeRegex(q), $options: 'i' };
        base.$or = [
          { orderCode: regex }, { code: regex },
          { 'customer.name': regex }, { 'customer.phone': regex }, { 'customer.email': regex },
          { customerName: regex }, { 'shippingAddress.fullName': regex }, { 'shippingAddress.phone': regex },
        ];
      }
      if (PAYMENT_STATUSES.includes(req.query.payment)) {
        base.paymentStatus = req.query.payment === 'unpaid' ? { $nin: ['paid', 'refunded'] } : req.query.payment;
      }
      const from = parseDay(req.query.from);
      const to = parseDay(req.query.to, true);
      if (from || to) {
        base.createdAt = {};
        if (from) base.createdAt.$gte = from;
        if (to) base.createdAt.$lte = to;
      }

      const statusFilter = STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
      const listFilter = { ...base, ...statusFilter };

      const [docs, total, ...statusCounts] = await Promise.all([
        orders().find(listFilter).sort(SORTS[req.query.sort] || SORTS.newest).skip((page - 1) * limit).limit(limit).toArray(),
        orders().countDocuments(listFilter),
        orders().countDocuments(base),
        ...STATUSES.map((s) => orders().countDocuments({ ...base, status: s })),
      ]);

      const map = await userMap(docs);
      const counts = { all: statusCounts[0] };
      STATUSES.forEach((s, i) => (counts[s] = statusCounts[i + 1]));

      res.json({
        items: docs.map((d) => {
          // Danh sách chỉ cần thông tin tóm tắt
          const { statusHistory, shippingAddress, adminNote, ...summary } = present(d, map.get(String(d.userId)));
          return summary;
        }),
        total,
        page,
        limit,
        counts,
      });
    } catch (error) {
      console.error('GET /api/admin/orders failed:', error.message);
      res.status(500).json({ message: 'Không tải được danh sách đơn hàng' });
    }
  });

  // ---------- Chi tiết ----------
  router.get('/orders/:id', async (req, res) => {
    try {
      const doc = await findOrder(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      res.json(await presentOne(doc));
    } catch (error) {
      console.error('GET /api/admin/orders/:id failed:', error.message);
      res.status(500).json({ message: 'Không tải được đơn hàng' });
    }
  });

  // ---------- Chuyển trạng thái ----------
  router.patch('/orders/:id/status', async (req, res) => {
    try {
      const doc = await findOrder(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

      const current = present(doc);
      const next = req.body?.status;
      if (!current.nextStatuses.includes(next)) {
        return res.status(400).json({
          message: `Không thể chuyển đơn từ "${current.status}" sang "${next}"`,
          nextStatuses: current.nextStatuses,
        });
      }

      const now = new Date();
      const note = cleanText(req.body?.note);
      const trackingCode = cleanText(req.body?.trackingCode);
      if (next === 'cancelled' && !note) {
        return res.status(400).json({ message: 'Vui lòng nhập lý do huỷ đơn', errors: { note: 'Vui lòng nhập lý do huỷ đơn' } });
      }

      const set = { status: next, updatedAt: now };
      if (trackingCode) set.trackingCode = trackingCode;
      // Giao thành công đơn COD = đã thu tiền
      if (next === 'delivered' && current.paymentMethod === 'cod') set.paymentStatus = 'paid';

      // Huỷ đơn: cộng lại tồn kho cho sách giấy nếu lúc đặt đã trừ kho (hoặc admin chọn hoàn kho)
      const restock = next === 'cancelled' && !doc.restocked && (req.body?.restock ?? doc.stockDeducted ?? false);
      if (restock) {
        const printItems = current.items.filter((it) => it.format === 'print' && it.bookId && ObjectId.isValid(it.bookId));
        await Promise.all(
          printItems.map((it) => books().updateOne({ _id: new ObjectId(it.bookId) }, { $inc: { stock: it.quantity } })),
        );
        set.restocked = true;
      }

      const history = [...current.statusHistory, { status: next, at: now, note: note || null }];
      await orders().updateOne({ _id: doc._id }, { $set: { ...set, statusHistory: history } });
      res.json(await presentOne(await orders().findOne({ _id: doc._id })));
    } catch (error) {
      console.error('PATCH /api/admin/orders/:id/status failed:', error.message);
      res.status(500).json({ message: 'Không cập nhật được trạng thái đơn' });
    }
  });

  // ---------- Sửa thông tin phụ ----------
  router.patch('/orders/:id', async (req, res) => {
    try {
      const doc = await findOrder(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

      const set = {};
      if (typeof req.body?.adminNote === 'string') set.adminNote = req.body.adminNote.trim().slice(0, 1000);
      if (typeof req.body?.trackingCode === 'string') set.trackingCode = req.body.trackingCode.trim().slice(0, 100);
      if (req.body?.paymentStatus !== undefined) {
        if (!PAYMENT_STATUSES.includes(req.body.paymentStatus)) {
          return res.status(400).json({ message: 'Trạng thái thanh toán không hợp lệ' });
        }
        set.paymentStatus = req.body.paymentStatus;
      }
      if (!Object.keys(set).length) return res.status(400).json({ message: 'Không có gì để cập nhật' });

      set.updatedAt = new Date();
      await orders().updateOne({ _id: doc._id }, { $set: set });
      res.json(await presentOne(await orders().findOne({ _id: doc._id })));
    } catch (error) {
      console.error('PATCH /api/admin/orders/:id failed:', error.message);
      res.status(500).json({ message: 'Không cập nhật được đơn hàng' });
    }
  });

  return router;
};

module.exports.present = present;
module.exports.FLOW = FLOW;
