'use strict';
// =====================================================================
// Thanh toán MoMo (cổng thật, mặc định môi trường TEST — tiền ảo, không trừ tiền thật)
//   POST /api/orders/:id/momo          { method: 'atm' | 'wallet' } tạo link thanh toán MoMo cho đơn "momo" đang chờ → { payUrl }
//   POST /api/payments/momo/verify     { momoOrderId } khách quay lại từ MoMo → server hỏi MoMo rồi ghi nhận
//   POST /api/payments/momo/ipn        MoMo gọi về (cần địa chỉ public, vd. ngrok) — kiểm chữ ký rồi ghi nhận
// Đơn chỉ thành "paid" khi chính API tra cứu của MoMo trả resultCode 0 và đúng số tiền.
// Cùng một transaction: đơn → paid + paymentVerification {source:'provider_webhook', provider:'momo', transactionId},
// ghi sổ payments, thêm ebook trong đơn vào tủ sách (personalBooks).
// Key test lấy từ mã mẫu công khai của MoMo (github.com/momo-wallet/payment). Lên production: đặt MOMO_* trong .env.
// =====================================================================
const express = require('express');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { requireCustomer, toObjectId } = require('../middleware/customer-auth');
const transaction = require('../middleware/admin-transaction');
const { hasEbookEntitlement } = require('../middleware/admin-safe-status');
const { ObjectId } = require('mongodb');
const { orderView } = require('./customer-orders');

const failure = (status, message) => Object.assign(new Error(message), { status });
const TEST_ENDPOINT = 'https://test-payment.momo.vn';
const PENDING_CODES = [1000, 7000, 7002]; // đã tạo / đang xử lý — chưa có kết quả cuối

function config() {
  const endpoint = (process.env.MOMO_ENDPOINT || TEST_ENDPOINT).replace(/\/+$/, '');
  const isTest = endpoint === TEST_ENDPOINT;
  // Key test công khai chỉ dùng khi đang trỏ tới môi trường test
  const partnerCode = process.env.MOMO_PARTNER_CODE || (isTest ? 'MOMO' : '');
  const accessKey = process.env.MOMO_ACCESS_KEY || (isTest ? 'F8BBA842ECF85' : '');
  const secretKey = process.env.MOMO_SECRET_KEY || (isTest ? 'K951B6PE1waDMi640xX08PD3vg6EkVlz' : '');
  if (!partnerCode || !accessKey || !secretKey) throw failure(503, 'Chưa cấu hình MoMo trên server.');
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:4200').replace(/\/+$/, '');
  const ipnUrl = process.env.MOMO_IPN_URL || `http://localhost:${process.env.PORT || 3002}/api/payments/momo/ipn`;
  return { endpoint, isTest, partnerCode, accessKey, secretKey, clientUrl, ipnUrl };
}

const sign = (secret, raw) => createHmac('sha256', secret).update(raw).digest('hex');

function sameSignature(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

async function callMomo(cfg, path, body) {
  let res;
  try {
    res = await fetch(cfg.endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  } catch {
    throw failure(503, 'Không kết nối được MoMo. Vui lòng thử lại.');
  }
  const data = await res.json().catch(() => null);
  if (!data || typeof data.resultCode !== 'number') throw failure(503, 'MoMo trả về dữ liệu không hợp lệ.');
  return data;
}

/** Tạo link thanh toán cho đơn. Mỗi lần tạo là một mã giao dịch MoMo mới, lưu vào order.momoAttempts */
async function createPayment(db, userId, id, method = 'atm') {
  const cfg = config();
  const orderId = toObjectId(String(id));
  const order = orderId && await db.collection('orders').findOne({ _id: orderId, userId });
  if (!order) throw failure(404, 'Không tìm thấy đơn hàng.');
  if (order.paymentMethod !== 'momo') throw failure(409, 'Đơn không chọn thanh toán MoMo.');
  if (order.status !== 'pending' || order.paymentStatus !== 'unpaid') throw failure(409, 'Đơn không còn chờ thanh toán.');
  const amount = order.total;
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 50000000)
    throw failure(409, 'MoMo chỉ nhận đơn từ 1.000đ đến 50.000.000đ.');
  const code = String(order.orderCode || orderId).replace(/[^0-9A-Za-z]/g, '');
  const momoOrderId = `${code}-${Date.now().toString(36)}`;
  const requestId = momoOrderId;
  const orderInfo = `Thanh toán đơn ${order.orderCode || code} tại Lightbook`;
  const redirectUrl = `${cfg.clientUrl}/checkout`;
  const extraData = '';
  // atm: trang nhập thẻ ATM nội địa (môi trường test dùng thẻ test, không cần app)
  // wallet: mã QR ví MoMo — môi trường test chỉ app MoMo bản test (UAT) quét được, app MoMo thật báo lỗi QR
  const requestType = method === 'wallet' ? 'captureWallet' : 'payWithATM';
  const raw = `accessKey=${cfg.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${cfg.ipnUrl}&orderId=${momoOrderId}` +
    `&orderInfo=${orderInfo}&partnerCode=${cfg.partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
  const data = await callMomo(cfg, '/v2/gateway/api/create', { partnerCode: cfg.partnerCode, accessKey: cfg.accessKey, requestId,
    amount, orderId: momoOrderId, orderInfo, redirectUrl, ipnUrl: cfg.ipnUrl, extraData, requestType, autoCapture: true,
    lang: 'vi', signature: sign(cfg.secretKey, raw) });
  if (data.resultCode !== 0 || typeof data.payUrl !== 'string' || !data.payUrl.startsWith('https://'))
    throw failure(503, data.message ? `MoMo: ${data.message}` : 'Không tạo được thanh toán MoMo.');
  const saved = await db.collection('orders').updateOne({ _id: orderId, userId, status: 'pending', paymentStatus: 'unpaid' },
    { $push: { momoAttempts: { orderId: momoOrderId, requestId, amount, createdAt: new Date() } }, $set: { updatedAt: new Date() } });
  if (saved.modifiedCount !== 1) throw failure(409, 'Đơn vừa thay đổi; tải lại trước khi thanh toán.');
  return { payUrl: data.payUrl, momoOrderId, test: cfg.isTest };
}

/** Hỏi MoMo trạng thái giao dịch. Chỉ kết quả từ API này mới được dùng để ghi "paid" */
async function queryPayment(cfg, attempt) {
  const raw = `accessKey=${cfg.accessKey}&orderId=${attempt.orderId}&partnerCode=${cfg.partnerCode}&requestId=${attempt.requestId}`;
  return callMomo(cfg, '/v2/gateway/api/query', { partnerCode: cfg.partnerCode, requestId: attempt.requestId,
    orderId: attempt.orderId, lang: 'vi', signature: sign(cfg.secretKey, raw) });
}

/** Ghi nhận đã thanh toán + cấp ebook — một transaction, chạy lại nhiều lần vẫn an toàn */
async function settlePaid(db, orderId, attempt, transId) {
  try {
    return await transaction(db, async (session) => {
      const orders = db.collection('orders');
      const current = await orders.findOne({ _id: orderId }, { session });
      if (!current) throw failure(404, 'Không tìm thấy đơn hàng.');
      if (current.paymentStatus === 'paid') {
        if (current.paymentVerification?.provider === 'momo' && current.paymentVerification.transactionId === transId) return current;
        throw failure(409, 'Đơn đã được ghi nhận thanh toán bằng giao dịch khác.');
      }
      if (current.status !== 'pending' || current.paymentStatus !== 'unpaid')
        throw failure(409, 'MoMo báo đã thanh toán nhưng đơn không còn chờ thanh toán. Vui lòng liên hệ Lightbook để được hỗ trợ hoàn tiền.');
      if (current.total !== attempt.amount) throw failure(409, 'Số tiền MoMo không khớp đơn hàng.');
      const now = new Date();
      await db.collection('payments').insertOne({ _id: orderId, orderId, userId: current.userId, paymentMethod: 'momo',
        amount: attempt.amount, status: 'paid', reference: transId, provider: 'momo', momoOrderId: attempt.orderId,
        source: 'provider_webhook', confirmedAt: now, createdAt: now }, { session });
      const set = { paymentStatus: 'paid', paidAt: now, updatedAt: now,
        paymentVerification: { source: 'provider_webhook', provider: 'momo', transactionId: transId, momoOrderId: attempt.orderId, verifiedAt: now } };
      // Đơn chỉ có ebook không cần xác nhận / giao hàng: trả tiền xong là hoàn tất (ebook vào tủ sách ngay bên dưới).
      // Đơn có sách giấy vẫn "pending" để shop xác nhận và giao.
      const ebookOnly = (current.items || []).length > 0 && current.items.every((line) => line.format === 'ebook');
      if (ebookOnly) Object.assign(set, { status: 'delivered', deliveredAt: now });
      const changed = await orders.updateOne({ _id: orderId, status: 'pending', paymentStatus: 'unpaid' },
        { $set: set, ...(ebookOnly ? { $push: { statusHistory: { status: 'delivered', at: now, note: 'Đã thanh toán MoMo — ebook đã vào tủ sách' } } } : {}) }, { session });
      if (changed.modifiedCount !== 1) throw failure(409, 'Đơn vừa thay đổi; tải lại trước khi thử lại.');
      const paid = { ...current, ...set,
        statusHistory: [...(current.statusHistory || []), ...(ebookOnly ? [{ status: 'delivered', at: now, note: 'Đã thanh toán MoMo — ebook đã vào tủ sách' }] : [])] };
      for (const item of (current.items || []).filter((line) => line.format === 'ebook')) {
        const bookId = toObjectId(String(item.bookId));
        if (!bookId) throw failure(409, 'Tham chiếu Ebook không hợp lệ.');
        const rows = await db.collection('personalBooks').find({ userId: current.userId, bookId: { $in: [bookId, String(bookId)] }, isDemo: { $ne: true } }, { session }).toArray();
        let owned = false;
        for (const row of rows) if (await hasEbookEntitlement(db, row, session)) { owned = true; break; }
        if (owned) continue; // đã có quyền đọc (vd. nhận miễn phí trước đó) thì không thêm bản trùng
        const _id = new ObjectId(createHash('sha256').update(`purchase-ebook:${orderId}:${bookId}`).digest('hex').slice(0, 24));
        await db.collection('personalBooks').insertOne({ _id, userId: current.userId, bookId, orderId, orderCode: current.orderCode,
          acquisitionType: 'purchase', acquisitionPrice: Number(item.price) || 0, paymentMode: 'standard', readingStatus: 'unread',
          page: 0, progressPercent: 0, bookmarks: [], notes: [], highlights: [], purchasedAt: now, createdAt: now, updatedAt: now }, { session });
      }
      await db.collection('notifications').insertOne({ userId: current.userId, read: false, createdAt: now, type: 'order', icon: 'box',
        title: 'Đã thanh toán đơn #' + current.orderCode,
        message: (current.items || []).some((i) => i.format === 'ebook') ? 'MoMo đã xác nhận. Ebook trong đơn đã có trong tủ sách của bạn.' : 'MoMo đã xác nhận thanh toán.',
        action: null }, { session });
      return paid;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Hai lần xác nhận chạy cùng lúc: lần sau gặp khoá trùng, đọc lại kết quả lần trước
    const committed = await db.collection('orders').findOne({ _id: orderId });
    if (committed?.paymentStatus === 'paid' && committed.paymentVerification?.transactionId === transId) return committed;
    throw error;
  }
}

/** Tra MoMo cho giao dịch của đơn → 'paid' | 'pending' | 'failed' */
async function verifyAttempt(db, order, attempt) {
  const cfg = config();
  const result = await queryPayment(cfg, attempt);
  if (result.resultCode === 0 && result.partnerCode === cfg.partnerCode && result.orderId === attempt.orderId &&
      Number(result.amount) === attempt.amount && result.transId) {
    return { status: 'paid', order: await settlePaid(db, order._id, attempt, String(result.transId)) };
  }
  if (PENDING_CODES.includes(result.resultCode)) return { status: 'pending', order, message: result.message };
  return { status: 'failed', order, message: result.message || 'Thanh toán MoMo không thành công.' };
}

module.exports = function customerMomoPaymentRoutes(getDb) {
  const router = express.Router();
  const auth = requireCustomer(getDb);

  router.post('/orders/:id/momo', auth, async (req, res, next) => {
    try {
      const method = req.body?.method === 'wallet' ? 'wallet' : 'atm';
      res.json(await createPayment(getDb(), req.customer.userId, req.params.id, method));
    } catch (error) { next(error); }
  });

  router.post('/payments/momo/verify', auth, async (req, res, next) => {
    try {
      const momoOrderId = typeof req.body?.momoOrderId === 'string' ? req.body.momoOrderId.trim() : '';
      if (!momoOrderId) throw failure(400, 'Thiếu mã giao dịch MoMo.');
      const db = getDb();
      const order = await db.collection('orders').findOne({ userId: req.customer.userId, 'momoAttempts.orderId': momoOrderId });
      if (!order) throw failure(404, 'Không tìm thấy đơn hàng của giao dịch này.');
      const attempt = order.momoAttempts.find((a) => a.orderId === momoOrderId);
      if (order.paymentStatus === 'paid') return res.json({ status: 'paid', order: orderView(order) });
      const result = await verifyAttempt(db, order, attempt);
      res.json({ status: result.status, message: result.message || null, order: orderView(result.order) });
    } catch (error) { next(error); }
  });

  // MoMo gọi server-to-server. Luôn trả 204 để MoMo không gửi lại liên tục; lỗi ghi log.
  router.post('/payments/momo/ipn', async (req, res) => {
    try {
      const b = req.body || {};
      const cfg = config();
      const raw = `accessKey=${cfg.accessKey}&amount=${b.amount}&extraData=${b.extraData ?? ''}&message=${b.message}&orderId=${b.orderId}` +
        `&orderInfo=${b.orderInfo}&orderType=${b.orderType}&partnerCode=${b.partnerCode}&payType=${b.payType}&requestId=${b.requestId}` +
        `&responseTime=${b.responseTime}&resultCode=${b.resultCode}&transId=${b.transId}`;
      if (!sameSignature(sign(cfg.secretKey, raw), b.signature)) return res.status(204).end();
      if (Number(b.resultCode) !== 0) return res.status(204).end();
      const db = getDb();
      const order = await db.collection('orders').findOne({ 'momoAttempts.orderId': String(b.orderId) });
      const attempt = order?.momoAttempts.find((a) => a.orderId === String(b.orderId));
      if (order && attempt && order.paymentStatus !== 'paid') await verifyAttempt(db, order, attempt);
    } catch (error) {
      console.error('MoMo IPN failed:', error.message);
    }
    res.status(204).end();
  });

  return router;
};
module.exports.settlePaid = settlePaid;

/** Hỏi MoMo mọi giao dịch của đơn (mới nhất trước) — có cái thành công thì ghi nhận. Dùng trước khi tự hủy đơn quá hạn */
module.exports.verifyOrder = async function verifyOrder(db, order) {
  let last = { status: 'failed', order };
  for (const attempt of [...(order.momoAttempts || [])].reverse()) {
    last = await verifyAttempt(db, order, attempt);
    if (last.status === 'paid') return last;
  }
  return last;
};
