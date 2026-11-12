// =====================================================================
// Đơn hàng + mã giảm giá của web khách hàng (bắt buộc đăng nhập)
//   POST /api/vouchers/apply              { code, items:[{bookId,quantity}], shippingMethod, combos }  → mã + số tiền giảm
//   POST /api/orders                      Idempotency-Key + { items, addressId, shippingMethod, paymentMethod, voucherCode, note }
//   GET  /api/account/orders              đơn của chính người đăng nhập (đơn cũ chưa có userId thì khớp theo email)
//   GET  /api/orders/:id
//   PUT  /api/account/orders/:id/cancel   chỉ đơn "pending"
//   POST /api/orders/:id/confirm-payment  trả 409 chờ xác minh, không ghi paid hoặc cấp ebook
// Tiền luôn tính lại ở đây từ giá trong collection books + vouchers (không tin số tiền trang gửi lên).
// Cấu trúc đơn theo my-server/routes/admin-orders.js.
// =====================================================================
const express = require('express');
const { requireCustomer, toObjectId } = require('../middleware/customer-auth');
const { computeTotals, voucherProblem, publicVoucher } = require('./customer-pricing');

const PAYMENT_METHODS = ['momo', 'vnpay', 'bank_transfer', 'cod'];
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const iso = (d) => (d ? new Date(d).toISOString() : null);
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function orderView(o) {
  return {
    _id: String(o._id),
    orderCode: o.orderCode || String(o._id).slice(-6).toUpperCase(),
    items: (o.items || []).map((i) => ({
      bookId: String(i.bookId), title: i.title, image: i.image || null, price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1, format: i.format === 'ebook' ? 'ebook' : 'print', variant: i.variant, author: i.author,
    })),
    subtotal: Number(o.subtotal) || 0,
    shippingFee: Number(o.shippingFee) || 0,
    discount: (Number(o.discount) || 0) + (Number(o.comboDiscount) || 0),
    voucherCode: o.voucherCode || null,
    total: Number(o.total ?? o.totalAmount) || 0,
    shippingMethod: o.shippingMethod || null,
    paymentMethod: o.paymentMethod || 'cod',
    paymentStatus: o.paymentStatus === 'paid' ? 'paid' : 'unpaid',
    status: o.status || 'pending',
    statusHistory: (o.statusHistory || []).map((h) => ({ status: h.status, at: iso(h.at), note: h.note || null })),
    shippingAddress: o.shippingAddress
      ? { fullName: o.shippingAddress.fullName, phone: o.shippingAddress.phone, address: o.shippingAddress.address, ward: o.shippingAddress.ward || '', province: o.shippingAddress.province || '' }
      : null,
    note: o.note || '',
    createdAt: iso(o.createdAt),
  };
}

const VARIANT = { new: 'Sách mới', used: 'Sách cũ', ebook: 'Sách điện tử' };


const { ObjectId } = require('mongodb');
const { createHash } = require('node:crypto');
const transaction = require('../middleware/admin-transaction');
const revisions = require('../middleware/admin-revision');
const { publicSettings } = require('./admin-settings');
const { adjustStock, releaseVoucher } = require('../middleware/admin-safe-status');
const failure = (status, message) => Object.assign(new Error(message), { status });
const digest = (value) => createHash('sha256').update(value).digest('hex');

module.exports = function customerOrderRoutes(getDb) {
  const router = express.Router();
  const db = () => getDb();
  const auth = requireCustomer(getDb);
  const mine = (req) => ({ userId: req.customer.userId });
  const readable = (req) => ({ $or: [mine(req), { userId: null, 'customer.email': req.customer.email }] });

  function rejectClientPromotions(body) {
    if (body.combos !== undefined && (!Array.isArray(body.combos) || body.combos.length))
      throw failure(409, 'Combo chưa được máy chủ xác minh. Vui lòng bỏ combo trước khi đặt hàng.');
    if (['freeship', 'freeShipping', 'comboDiscount', 'discount', 'total', 'shippingFee'].some((key) => Object.hasOwn(body, key)))
      throw failure(400, 'Không nhận giá hoặc ưu đãi do client tự khai báo.');
  }
  function canonicalItems(items) {
    if (!Array.isArray(items) || !items.length || items.length > 50) throw failure(400, 'Giỏ hàng không hợp lệ');
    const quantities = new Map();
    for (const item of items) {
      const id = toObjectId(String(item?.bookId));
      if (!id || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
        throw failure(400, 'Sách hoặc số lượng không hợp lệ');
      const quantity = (quantities.get(String(id)) || 0) + item.quantity;
      if (quantity > 99) throw failure(400, 'Số lượng vượt giới hạn');
      quantities.set(String(id), quantity);
    }
    return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([bookId, quantity]) => ({ bookId, quantity }));
  }
  function requestIdentity(req) {
    const key = req.get('Idempotency-Key');
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw failure(400, 'Cần Idempotency-Key (16–128 ký tự) cho mỗi lần đặt hàng; dùng lại khóa khi thử lại.');
    const b = req.body || {};
    const items = canonicalItems(b.items);
    const canonical = { items, paymentMethod: b.paymentMethod, addressId: String(b.addressId || ''),
      shippingMethod: b.shippingMethod === 'express' ? 'express' : 'standard',
      voucherCode: text(b.voucherCode).toUpperCase(), note: text(b.note).slice(0, 300) };
    const keyHash = digest(String(req.customer.userId) + ':' + key);
    // Built-in unique _id serializes retries across processes; no new index/collection.
    return { id: new ObjectId(keyHash.slice(0, 24)), keyHash, requestHash: digest(JSON.stringify(canonical)), items };
  }
  function replay(order, identity, req) {
    if (String(order.userId) !== String(req.customer.userId) || order.isDemo === true ||
        order.idempotencyKeyHash !== identity.keyHash || order.requestHash !== identity.requestHash)
      throw failure(409, 'Khóa đặt hàng đã được sử dụng cho nội dung khác.');
    return order;
  }
  async function loadLines(rawItems, session) {
    const items = canonicalItems(rawItems);
    const books = await db().collection('books').find({ _id: { $in: items.map((item) => toObjectId(item.bookId)) } }, { session }).toArray();
    const byId = new Map(books.map((book) => [String(book._id), book]));
    const authorIds = books.map((book) => book.authorId).filter(Boolean);
    const authors = await db().collection('authors').find({ _id: { $in: authorIds } }, { session, projection: { name: 1 } }).toArray();
    const names = new Map(authors.map((author) => [String(author._id), author.name]));
    return items.map(({ bookId, quantity }) => {
      const book = byId.get(bookId);
      if (!book || book.isDemo === true || book.status !== 'active' || !['new', 'used', 'ebook'].includes(book.bookType))
        throw failure(409, 'Sách không còn bán hoặc chưa xác minh loại sách');
      if (book.bookType === 'ebook' && quantity !== 1) throw failure(400, 'Mỗi ebook chỉ được mua một bản');
      if (!Number.isSafeInteger(book.price) || book.price < 0) throw failure(409, 'Giá sách chưa hợp lệ');
      if (book.bookType !== 'ebook' && (!Number.isSafeInteger(book.stock) || book.stock < quantity))
        throw failure(409, 'Sách không đủ tồn kho');
      return { bookId: book._id, title: book.title, image: book.image || null, price: book.price, quantity,
        ebook: book.bookType === 'ebook', format: book.bookType === 'ebook' ? 'ebook' : 'print', variant: VARIANT[book.bookType],
        author: names.get(String(book.authorId)) || (book.authorNames || []).join(', ') || null };
    });
  }
  async function findVoucher(code, req, session) {
    const clean = text(code).toUpperCase();
    if (!clean) return null;
    const voucher = await db().collection('vouchers').findOne({ code: { $regex: '^' + escapeRegex(clean) + '$', $options: 'i' } }, { session });
    const usage = voucher && { $or: [{ voucherId: voucher._id },
      { voucherCode: { $regex: '^' + escapeRegex(voucher.code) + '$', $options: 'i' } }],
      status: { $ne: 'cancelled' }, isDemo: { $ne: true } };
    const usedByUser = voucher ? await db().collection('orders').countDocuments({ ...usage, ...mine(req) }, { session }) : 0;
    const recordedOrders = voucher ? await db().collection('orders').countDocuments(usage, { session }) : 0;
    if (voucher && (voucher.usedCount ?? 0) > recordedOrders)
      throw failure(409, 'Lịch sử sử dụng voucher chưa liên kết đầy đủ; cần đối soát trước khi áp dụng giới hạn mỗi khách.');
    const problem = voucherProblem(voucher, new Date(), usedByUser) ||
      (voucher && voucherProblem({ ...voucher, usedCount: Math.max(voucher.usedCount ?? 0, recordedOrders) }, new Date(), usedByUser));
    if (problem || voucher?.isDemo === true) throw failure(409, problem || 'Voucher demo không được sử dụng');
    return { ...voucher, reservationCount: Math.max(voucher.usedCount ?? 0, recordedOrders) };
  }
  async function notify(userId, doc, session) {
    await db().collection('notifications').insertOne({ userId, read: false, createdAt: new Date(), ...doc }, { session });
  }
  router.post('/vouchers/apply', auth, async (req, res, next) => {
    try {
      rejectClientPromotions(req.body || {});
      const voucher = await findVoucher(req.body?.code, req);
      if (!voucher) throw failure(400, 'Vui lòng nhập mã giảm giá');
      const lines = await loadLines(req.body?.items);
      const { shipping } = await publicSettings(db());
      const totals = computeTotals(lines, { method: req.body?.shippingMethod, voucher, shipping });
      if (totals.voucherError) throw failure(400, totals.voucherError);
      res.json({ ...publicVoucher(voucher), discount: totals.discount });
    } catch (error) { next(error); }
  });
  router.post('/orders', auth, async (req, res, next) => {
    try {
      const b = req.body || {};
      rejectClientPromotions(b);
      if (!PAYMENT_METHODS.includes(b.paymentMethod)) throw failure(400, 'Vui lòng chọn phương thức thanh toán');
      const identity = requestIdentity(req);
      let created = false;
      let order;
      try {
        order = await transaction(db(), async (session) => {
          created = false; // Driver can retry the entire callback after a write conflict.
          const existing = await db().collection('orders').findOne({ _id: identity.id }, { session });
          if (existing) return replay(existing, identity, req);
          const lines = await loadLines(identity.items, session);
          if (b.paymentMethod === 'cod' && lines.some((line) => line.ebook)) throw failure(400, 'COD không áp dụng cho ebook');
          let shippingAddress = null;
          if (lines.some((line) => !line.ebook)) {
            const addressId = toObjectId(String(b.addressId || ''));
            const address = addressId && await db().collection('addresses').findOne({ _id: addressId, ...mine(req), isDemo: { $ne: true } }, { session });
            if (!address) throw failure(400, 'Vui lòng chọn địa chỉ nhận hàng');
            shippingAddress = { fullName: address.recipientName || address.fullName, phone: address.phone,
              address: address.street || address.addressLine, ward: address.ward || '', district: '', province: address.province || '' };
          }
          const voucher = await findVoucher(b.voucherCode, req, session);
          const { shipping } = await publicSettings(db(), session);
          const totals = computeTotals(lines, { method: b.shippingMethod, voucher, shipping });
          if (totals.voucherError) throw failure(400, totals.voucherError);
          if (![totals.subtotal, totals.total].every(Number.isSafeInteger)) throw failure(400, 'Tổng tiền vượt giới hạn');
          if (voucher) {
            // Writing the shared voucher serializes total AND per-user quota checks
            // across Node processes. Driver retries rerun the count on a new snapshot.
            const used = voucher.usedCount ?? 0;
            const reserved = await db().collection('vouchers').updateOne({ _id: voucher._id,
              usedCount: Object.hasOwn(voucher, 'usedCount') ? used : { $exists: false }, isDemo: { $ne: true }, ...revisions.snapshot(voucher) },
              { $set: { usedCount: voucher.reservationCount + 1, updatedAt: revisions.nextUpdatedAt(voucher) } }, { session });
            if (reserved.modifiedCount !== 1) throw failure(409, 'Voucher vừa thay đổi; vui lòng thử lại');
          }
          await adjustStock(db(), session, lines, -1);
          const now = new Date();
          const document = { _id: identity.id, idempotencyKeyHash: identity.keyHash, requestHash: identity.requestHash,
            orderCode: 'LB-' + String(identity.id).toUpperCase(), userId: req.customer.userId,
            customer: { name: req.customer.user.fullName || '', email: req.customer.email, phone: req.customer.user.phone || shippingAddress?.phone || '' },
            shippingAddress, items: lines.map(({ ebook, ...line }) => line), subtotal: totals.subtotal, comboDiscount: 0,
            discount: totals.discount, voucherCode: voucher?.code || null, ...(voucher ? { voucherId: voucher._id, voucherReleased: false } : {}),
            shippingFee: totals.shippingFee, shippingMethod: totals.shippingMethod, total: totals.total,
            paymentMethod: b.paymentMethod, paymentStatus: 'unpaid', status: 'pending',
            statusHistory: [{ status: 'pending', at: now, note: null }], note: text(b.note).slice(0, 300),
            stockDeducted: lines.some((line) => !line.ebook), restocked: false, createdAt: now, updatedAt: now };
          await db().collection('orders').insertOne(document, { session });
          await notify(req.customer.userId, { type: 'order', icon: 'box', title: 'Đặt hàng thành công #' + document.orderCode,
            message: b.paymentMethod === 'cod' ? 'Lightbook sẽ xác nhận và giao đơn sớm nhất.' : 'Đơn đang chờ xác minh thanh toán.',
            action: { label: 'Xem đơn', link: '/account/orders' } }, session);
          created = true;
          return document;
        });
      } catch (error) {
        // E11000 may be returned for simultaneous inserts of the same _id.
        if (error.code !== 11000) throw error;
        const existing = await db().collection('orders').findOne({ _id: identity.id });
        if (!existing) throw error;
        order = replay(existing, identity, req);
        created = false;
      }
      res.status(created ? 201 : 200).json(orderView(order));
    } catch (error) { next(error); }
  });
  router.get('/account/orders', auth, async (req, res, next) => {
    try {
      const list = await db().collection('orders').find(readable(req)).sort({ createdAt: -1 }).limit(100).toArray();
      res.json(list.map(orderView));
    } catch (error) { next(error); }
  });
  router.get('/orders/:id', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const order = id ? await db().collection('orders').findOne({ _id: id, ...readable(req) }) : null;
      if (!order) throw failure(404, 'Không tìm thấy đơn hàng');
      res.json(orderView(order));
    } catch (error) { next(error); }
  });
  router.put('/account/orders/:id/cancel', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      if (!id) throw failure(404, 'Không tìm thấy đơn hàng');
      const order = await transaction(db(), async (session) => {
        const current = await db().collection('orders').findOne({ _id: id, ...mine(req) }, { session });
        if (!current) throw failure(404, 'Không tìm thấy đơn hàng');
        if (current.isDemo === true) throw failure(409, 'Đơn demo chỉ được xem');
        if (current.status === 'cancelled') return current;
        if (current.status !== 'pending' || current.paymentStatus !== 'unpaid')
          throw failure(409, 'Đơn đã xác nhận/đã thanh toán cần quy trình hủy hoặc hoàn trả');
        if (current.stockDeducted === true && !current.restocked) await adjustStock(db(), session, current.items, 1);
        await releaseVoucher(db(), session, current);
        const now = new Date();
        const set = { status: 'cancelled', updatedAt: now,
          restocked: current.restocked === true || current.stockDeducted === true,
          ...(current.voucherCode ? { voucherReleased: true } : {}) };
        const changed = await db().collection('orders').updateOne({ _id: id, ...mine(req), status: 'pending', isDemo: { $ne: true } },
          { $set: set, $push: { statusHistory: { status: 'cancelled', at: now, note: 'Khách hủy đơn' } } }, { session });
        if (changed.modifiedCount !== 1) throw failure(409, 'Đơn hàng vừa thay đổi');
        await notify(req.customer.userId, { type: 'order', icon: 'box', title: 'Đã hủy đơn #' + current.orderCode,
          message: 'Đơn hàng đã được hủy theo yêu cầu của bạn.', action: null }, session);
        return { ...current, ...set };
      });
      res.json(orderView(order));
    } catch (error) { next(error); }
  });
  // Customer clicks are never settlement proof. No online payment writes or ebook
  // grants until a separately authenticated provider verification is implemented.
  router.post('/orders/:id/confirm-payment', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const order = id ? await db().collection('orders').findOne({ _id: id, ...mine(req) }) : null;
      if (!order) throw failure(404, 'Không tìm thấy đơn hàng');
      res.status(409).json({ code: 'PAYMENT_VERIFICATION_UNAVAILABLE', paymentStatus: order.paymentStatus,
        message: 'Chưa tích hợp xác minh cổng thanh toán. Đơn vẫn chờ đối soát; không ghi nhận thanh toán thành công.' });
    } catch (error) { next(error); }
  });
  return router;
};
module.exports.orderView = orderView;
