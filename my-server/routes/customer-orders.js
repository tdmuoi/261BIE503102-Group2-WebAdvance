// =====================================================================
// Đơn hàng + mã giảm giá của web khách hàng (bắt buộc đăng nhập)
//   POST /api/vouchers/apply              { code, items:[{bookId,quantity}], shippingMethod, combos }  → mã + số tiền giảm
//   POST /api/orders                      { items, addressId, shippingMethod, paymentMethod, voucherCode, note, combos }
//   GET  /api/account/orders              đơn của chính người đăng nhập (đơn cũ chưa có userId thì khớp theo email)
//   GET  /api/orders/:id
//   PUT  /api/account/orders/:id/cancel   chỉ đơn "pending"
//   POST /api/orders/:id/confirm-payment  bản demo: chưa nối cổng MoMo/VNPay thật, người dùng bấm "Tôi đã thanh toán"
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

module.exports = function customerOrderRoutes(getDb) {
  const router = express.Router();
  const db = () => getDb();
  const auth = requireCustomer(getDb);
  const mine = (req) => ({ $or: [{ userId: req.customer.userId }, { userId: null, 'customer.email': req.customer.email }] });

  /** Đọc sách trong DB, trả về dòng tính tiền. Lỗi → { error } */
  async function loadLines(rawItems) {
    const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 50);
    const ids = items.map((i) => toObjectId(String(i?.bookId)));
    if (!items.length || ids.some((id) => !id)) return { error: 'Giỏ hàng không hợp lệ' };
    const books = await db().collection('books').find({ _id: { $in: ids } }).toArray();
    const byId = new Map(books.map((b) => [String(b._id), b]));
    const authorIds = books.map((b) => b.authorId).filter(Boolean);
    const authors = await db().collection('authors').find({ _id: { $in: authorIds } }, { projection: { name: 1 } }).toArray();
    const authorName = new Map(authors.map((a) => [String(a._id), a.name]));
    const lines = [];
    for (const [index, item] of items.entries()) {
      const book = byId.get(String(ids[index]));
      if (!book || (book.status && book.status !== 'active')) return { error: 'Có sách trong giỏ không còn bán, vui lòng cập nhật giỏ hàng' };
      const ebook = book.bookType === 'ebook';
      const quantity = ebook ? 1 : Math.min(Math.max(parseInt(item.quantity, 10) || 1, 1), 99);
      if (!ebook && Number.isFinite(book.stock) && book.stock < quantity) return { error: `“${book.title}” chỉ còn ${book.stock} cuốn` };
      lines.push({
        bookId: book._id, title: book.title, image: book.image || null, price: Number(book.price) || 0, quantity, ebook,
        format: ebook ? 'ebook' : 'print', variant: VARIANT[book.bookType] || 'Sách mới',
        author: (book.authorId && authorName.get(String(book.authorId))) || (book.authorNames || []).join(', ') || undefined,
      });
    }
    return { lines };
  }

  async function findVoucher(code, req) {
    const clean = text(code).toUpperCase();
    if (!clean) return { voucher: null };
    const voucher = await db().collection('vouchers').findOne({ code: { $regex: `^${escapeRegex(clean)}$`, $options: 'i' } });
    const usedByUser = voucher
      ? await db().collection('orders').countDocuments({ ...mine(req), voucherCode: voucher.code, status: { $ne: 'cancelled' } })
      : 0;
    const problem = voucherProblem(voucher, new Date(), usedByUser);
    return problem ? { error: problem } : { voucher };
  }

  router.post('/vouchers/apply', auth, async (req, res, next) => {
    try {
      const found = await findVoucher(req.body?.code, req);
      if (found.error || !found.voucher) return res.status(404).json({ message: found.error || 'Vui lòng nhập mã giảm giá' });
      let preview = null;
      if (Array.isArray(req.body?.items) && req.body.items.length) {
        const loaded = await loadLines(req.body.items);
        if (!loaded.error) {
          preview = computeTotals(loaded.lines, { method: req.body?.shippingMethod, combos: req.body?.combos, voucher: found.voucher });
          if (preview.voucherError) return res.status(400).json({ message: preview.voucherError });
        }
      }
      res.json({ ...publicVoucher(found.voucher), discount: preview?.discount ?? null });
    } catch (error) {
      next(error);
    }
  });

  async function nextOrderCode() {
    const now = new Date();
    const day = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const count = await db().collection('orders').countDocuments({ orderCode: { $regex: `^LB-${day}-` } });
    return `LB-${day}-${String(count + 1 + Math.floor(Math.random() * 3)).padStart(4, '0')}`;
  }

  async function notify(userId, doc) {
    await db().collection('notifications').insertOne({ userId, read: false, createdAt: new Date(), ...doc }).catch(() => undefined);
  }

  /** Đơn đã trả tiền: ebook vào tủ sách */
  async function grantEbooks(order) {
    const ebooks = (order.items || []).filter((i) => i.format === 'ebook');
    for (const item of ebooks) {
      await db().collection('personalBooks').updateOne(
        { userId: order.userId, bookId: toObjectId(String(item.bookId)) },
        { $setOnInsert: { title: item.title, image: item.image, orderCode: order.orderCode, purchasedAt: new Date(), page: 0, createdAt: new Date() } },
        { upsert: true },
      );
    }
    if (ebooks.length) {
      await notify(order.userId, {
        type: 'bookshelf', icon: 'book', title: 'Ebook mới đã vào tủ sách',
        message: `${ebooks.map((e) => `“${e.title}”`).join(', ')} đã sẵn sàng để đọc.`, action: { label: 'Đọc ngay', link: '/account/bookshelf-ebooks' },
      });
    }
  }

  router.post('/orders', auth, async (req, res, next) => {
    try {
      const b = req.body || {};
      const paymentMethod = PAYMENT_METHODS.includes(b.paymentMethod) ? b.paymentMethod : null;
      if (!paymentMethod) return res.status(400).json({ message: 'Vui lòng chọn phương thức thanh toán' });
      const loaded = await loadLines(b.items);
      if (loaded.error) return res.status(400).json({ message: loaded.error });
      const lines = loaded.lines;
      const hasPhysical = lines.some((l) => !l.ebook);
      if (paymentMethod === 'cod' && lines.some((l) => l.ebook)) return res.status(400).json({ message: 'COD không áp dụng cho đơn có sách điện tử' });

      let shippingAddress = null;
      if (hasPhysical) {
        const addressId = toObjectId(String(b.addressId || ''));
        const address = addressId ? await db().collection('addresses').findOne({ _id: addressId, userId: req.customer.userId }) : null;
        if (!address) return res.status(400).json({ message: 'Vui lòng chọn địa chỉ nhận hàng' });
        shippingAddress = {
          fullName: address.recipientName || address.fullName, phone: address.phone,
          address: address.street || address.addressLine, ward: address.ward || '', district: '', province: address.province || '',
        };
      }

      const found = await findVoucher(b.voucherCode, req);
      if (found.error) return res.status(400).json({ message: found.error });
      const totals = computeTotals(lines, { method: b.shippingMethod, combos: b.combos, voucher: found.voucher });
      if (totals.voucherError) return res.status(400).json({ message: totals.voucherError });

      const now = new Date();
      const { user, email, userId } = req.customer;
      const order = {
        orderCode: await nextOrderCode(),
        userId,
        customer: { name: user.fullName || '', email, phone: user.phone || shippingAddress?.phone || '' },
        shippingAddress,
        items: lines.map(({ bookId, title, image, price, quantity, format, variant, author }) => ({ bookId, title, image, price, quantity, format, variant, author })),
        subtotal: totals.subtotal,
        comboDiscount: totals.comboDiscount,
        discount: totals.discount,
        voucherCode: found.voucher ? found.voucher.code : null,
        shippingFee: totals.shippingFee,
        shippingMethod: totals.shippingMethod,
        total: totals.total,
        paymentMethod,
        paymentStatus: 'unpaid',
        status: 'pending',
        statusHistory: [{ status: 'pending', at: now, note: null }],
        note: text(b.note).slice(0, 300),
        stockDeducted: false,
        createdAt: now,
        updatedAt: now,
      };

      // Trừ tồn kho sách giấy; thiếu hàng thì hoàn lại phần đã trừ
      const deducted = [];
      for (const line of lines.filter((l) => !l.ebook)) {
        const r = await db().collection('books').updateOne({ _id: line.bookId, stock: { $gte: line.quantity } }, { $inc: { stock: -line.quantity } });
        if (r.matchedCount) {
          deducted.push(line);
          continue;
        }
        const current = await db().collection('books').findOne({ _id: line.bookId }, { projection: { stock: 1 } });
        if (current && typeof current.stock !== 'number') continue; // sách không quản lý tồn kho
        for (const d of deducted) await db().collection('books').updateOne({ _id: d.bookId }, { $inc: { stock: d.quantity } });
        return res.status(409).json({ message: `“${line.title}” vừa hết hàng, vui lòng cập nhật giỏ hàng` });
      }
      order.stockDeducted = deducted.length > 0;
      order._id = (await db().collection('orders').insertOne(order)).insertedId;
      if (order.voucherCode) await db().collection('vouchers').updateOne({ code: order.voucherCode }, { $inc: { usedCount: 1 } });

      await notify(userId, {
        type: 'order', icon: 'box', title: `Đặt hàng thành công #${order.orderCode}`,
        message: paymentMethod === 'cod' ? 'Lightbook sẽ xác nhận và giao đơn sớm nhất.' : 'Vui lòng hoàn tất thanh toán để Lightbook xử lý đơn.',
        action: { label: 'Xem đơn', link: '/account/orders' },
      });
      res.status(201).json(orderView(order));
    } catch (error) {
      next(error);
    }
  });

  router.get('/account/orders', auth, async (req, res, next) => {
    try {
      const list = await db().collection('orders').find(mine(req)).sort({ createdAt: -1 }).limit(100).toArray();
      res.json(list.map(orderView));
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders/:id', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const order = id ? await db().collection('orders').findOne({ _id: id, ...mine(req) }) : null;
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      res.json(orderView(order));
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/orders/:id/cancel', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const order = id ? await db().collection('orders').findOne({ _id: id, ...mine(req) }) : null;
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      if (order.status !== 'pending') return res.status(409).json({ message: 'Đơn đã được xác nhận nên không huỷ được nữa' });
      const now = new Date();
      const updated = await db().collection('orders').findOneAndUpdate(
        { _id: id, status: 'pending' },
        { $set: { status: 'cancelled', updatedAt: now }, $push: { statusHistory: { status: 'cancelled', at: now, note: 'Khách huỷ đơn' } } },
        { returnDocument: 'after' },
      );
      if (!updated) return res.status(409).json({ message: 'Đơn đã được xác nhận nên không huỷ được nữa' });
      if (order.stockDeducted) {
        for (const item of order.items.filter((i) => i.format !== 'ebook')) {
          await db().collection('books').updateOne({ _id: toObjectId(String(item.bookId)), stock: { $exists: true } }, { $inc: { stock: item.quantity } });
        }
      }
      if (order.voucherCode) await db().collection('vouchers').updateOne({ code: order.voucherCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
      await notify(req.customer.userId, {
        type: 'order', icon: 'box', title: `Đã huỷ đơn #${order.orderCode}`,
        message: order.paymentStatus === 'paid' ? 'Tiền sẽ được hoàn trong 3–5 ngày làm việc.' : 'Đơn hàng đã được huỷ theo yêu cầu của bạn.',
        action: null,
      });
      res.json(orderView(updated));
    } catch (error) {
      next(error);
    }
  });

  // Demo thanh toán online: khi nối cổng thật, bước này do IPN/webhook của MoMo/VNPay gọi, không phải trang
  router.post('/orders/:id/confirm-payment', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const order = id ? await db().collection('orders').findOne({ _id: id, userId: req.customer.userId }) : null;
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      if (order.status === 'cancelled') return res.status(409).json({ message: 'Đơn đã bị huỷ' });
      if (order.paymentMethod === 'cod') return res.status(400).json({ message: 'Đơn COD thanh toán khi nhận hàng' });
      if (order.paymentStatus === 'paid') return res.json(orderView(order));
      const now = new Date();
      const ebookOnly = order.items.every((i) => i.format === 'ebook');
      const set = { paymentStatus: 'paid', paidAt: now, updatedAt: now };
      const push = ebookOnly ? { statusHistory: { status: 'delivered', at: now, note: 'Ebook đã vào tủ sách' } } : undefined;
      if (ebookOnly) set.status = 'delivered';
      const updated = await db().collection('orders').findOneAndUpdate({ _id: id }, push ? { $set: set, $push: push } : { $set: set }, { returnDocument: 'after' });
      await grantEbooks(updated);
      res.json(orderView(updated));
    } catch (error) {
      next(error);
    }
  });

  return router;
};

module.exports.orderView = orderView;
