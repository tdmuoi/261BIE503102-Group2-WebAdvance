"use strict";
const { ObjectId } = require("mongodb");
const { createHash } = require('node:crypto');
const revisions = require('./admin-revision');
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
function owned(doc) {
  if (doc.isDemo === true || doc.userId == null)
    throw failure(409, "Demo/owner policy is not approved; read only");
}
function quantities(items) {
  const result = new Map();
  for (const item of items) {
    if (
      !ObjectId.isValid(String(item.bookId)) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    )
      throw failure(409, "Unverified item identity/quantity");
    const id = String(item.bookId);
    const total = (result.get(id) || 0) + item.quantity;
    if (!Number.isSafeInteger(total)) throw failure(409, 'Quantity exceeds safe integer range');
    result.set(id, total);
  }
  return result;
}
// books and old_books share _id for used copies. Refuse ambiguous/mismatched stock;
// both updates must participate in the caller's transaction.
async function adjustStock(db, session, items, direction) {
  if (![1, -1].includes(direction)) throw failure(400, 'Invalid stock direction');
  let count = 0;
  for (const [id, qty] of quantities(items)) {
    const book = await db
      .collection("books")
      .findOne({ _id: new ObjectId(id) }, { session });
    if (!book) throw failure(409, "Book missing");
    if (book.isDemo === true) throw failure(409, 'Demo books are read only');
    if (book.bookType === "ebook") continue;
    if (
      !["new", "used"].includes(book.bookType) ||
      !Number.isSafeInteger(book.stock) ||
      book.stock < 0
    )
      throw failure(409, "Physical stock is not verified");
    const nextStock = book.stock + direction * qty;
    if (!Number.isSafeInteger(nextStock) || nextStock < 0) throw failure(409, 'Insufficient or unsafe stock');
    let timestamp = revisions.nextUpdatedAt(book);
    const storedTime = (doc) => typeof doc.updatedAt === 'string' ||
      (doc.updatedAt == null && typeof doc.createdAt === 'string') ? timestamp.toISOString() : timestamp;
    if (book.bookType === 'used') {
      const old = await db.collection('old_books').findOne({ _id: book._id }, { session });
      if (!old || old.isDemo === true || old.bookType !== 'used' || old.stock !== book.stock)
        throw failure(409, 'books/old_books stock mismatch; reconcile before processing');
      timestamp = new Date(Math.max(+timestamp, +revisions.nextUpdatedAt(old)));
      const updated = await db.collection('old_books').updateOne(
        { _id: old._id, stock: old.stock, bookType: 'used', isDemo: { $ne: true }, ...revisions.snapshot(old) },
        { $inc: { stock: direction * qty }, $set: { updatedAt: storedTime(old) } }, { session });
      if (updated.modifiedCount !== 1) throw failure(409, 'Used stock changed; reload');
    }
    const changed = await db
      .collection("books")
      .updateOne(
        { _id: book._id, bookType: book.bookType, stock: book.stock, isDemo: { $ne: true }, ...revisions.snapshot(book) },
        { $inc: { stock: direction * qty }, $set: { updatedAt: storedTime(book) } },
        { session },
      );
    if (changed.modifiedCount !== 1)
      throw failure(409, "Stock changed; reload");
    count++;
  }
  return count;
}
const stockReturn = (db, session, items) => adjustStock(db, session, items, 1);

async function releaseVoucher(db, session, order) {
  if (!order.voucherCode || order.voucherReleased === true) return;
  const voucher = await db.collection('vouchers').findOne(
    order.voucherId ? { _id: order.voucherId } : { code: order.voucherCode }, { session });
  if (!voucher || voucher.isDemo === true || !Number.isSafeInteger(voucher.usedCount) || voucher.usedCount < 1)
    throw failure(409, 'Voucher reservation cannot be verified');
  const result = await db.collection('vouchers').updateOne(
    { _id: voucher._id, usedCount: voucher.usedCount, isDemo: { $ne: true }, ...revisions.snapshot(voucher) },
    { $inc: { usedCount: -1 }, $set: { updatedAt: revisions.nextUpdatedAt(voucher) } }, { session });
  if (result.modifiedCount !== 1) throw failure(409, 'Voucher changed; retry');
}
// One settlement policy for revenue, refunds and ebook entitlements. No client
// request is allowed to manufacture these fields; legacy paid requires review.
function verifiedPaymentDate(order, now = new Date()) {
  const date = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(+parsed) ? parsed : null;
  };
  const at = date(order?.paidAt), proof = order?.paymentVerification, verifiedAt = date(proof?.verifiedAt);
  if (order?.isDemo === true || order?.paymentStatus !== 'paid' || !at || at > now || !verifiedAt || +at !== +verifiedAt) return null;
  if (proof.source === 'cod_delivery' && order.paymentMethod === 'cod') return at;
  if (proof.source === 'provider_webhook' && ['momo', 'vnpay', 'bank_transfer'].includes(order.paymentMethod) &&
      proof.provider === order.paymentMethod && typeof proof.transactionId === 'string' && proof.transactionId.trim()) return at;
  return null;
}
const identityVariants = (value) => ObjectId.isValid(String(value))
  ? [new ObjectId(String(value)), String(value)] : [value];
function freeEbookClaimId(userId, bookId) {
  return new ObjectId(createHash('sha256').update('free-ebook:' + String(userId).toLowerCase() + ':' + String(bookId).toLowerCase()).digest('hex').slice(0, 24));
}
async function hasEbookEntitlement(db, row, session) {
  // Only this server's explicit free-claim records qualify. A legacy/mock row
  // labelled "free" is not proof, and refunded/revoked rows never qualify.
  if (row && row.isDemo !== true && row.accessRevokedAt == null && row.accessRevokedOrderId == null &&
      row.acquisitionType === 'free' && row.acquisitionPrice === 0 && row.orderId == null && row.orderCode == null &&
      row.createdAt instanceof Date && Number.isFinite(+row.createdAt) && row.createdAt <= new Date() &&
      ObjectId.isValid(String(row.userId)) && ObjectId.isValid(String(row.bookId)) &&
      String(row._id) === String(freeEbookClaimId(row.userId, row.bookId))) return true;
  return !!await ebookEntitlementOrder(db, row, session);
}
async function ebookEntitlementOrder(db, row, session) {
  if (!row || row.isDemo === true || row.accessRevokedAt != null) return null;
  const link = row.orderId != null
    ? { _id: { $in: identityVariants(row.orderId) }, ...(row.orderCode ? { orderCode: row.orderCode } : {}) }
    : typeof row.orderCode === 'string' && row.orderCode ? { orderCode: row.orderCode } : null;
  if (!link) return null; // No guessed ownership/payment link for legacy rows.
  const orders = await db.collection('orders').find({ ...link, userId: { $in: identityVariants(row.userId) },
    isDemo: { $ne: true } }, { session }).limit(2).toArray();
  if (orders.length !== 1) return null;
  const order = orders[0];
  return verifiedPaymentDate(order) && !['cancelled', 'returned'].includes(order.status) &&
    (order.items || []).some((item) => String(item.bookId) === String(row.bookId) && item.format === 'ebook' &&
      Number.isSafeInteger(item.quantity) && item.quantity > 0) ? order : null;
}
async function revokeEbooks(db, session, order, at) {
  for (const item of (order.items || []).filter((item) => item.format === 'ebook')) {
    const rows = await db.collection('personalBooks').find({ userId: { $in: identityVariants(order.userId) },
      bookId: { $in: identityVariants(item.bookId) }, isDemo: { $ne: true } }, { session }).toArray();
    for (const row of rows) {
      const linked = row.orderId != null
        ? String(row.orderId) === String(order._id) && (!row.orderCode || row.orderCode === order.orderCode)
        : !!order.orderCode && row.orderCode === order.orderCode;
      if (!linked || row.accessRevokedAt != null) continue;
      const result = await db.collection('personalBooks').updateOne({ _id: row._id, userId: row.userId,
        bookId: row.bookId, isDemo: { $ne: true },
        accessRevokedAt: Object.hasOwn(row, 'accessRevokedAt') ? row.accessRevokedAt : { $exists: false } },
      { $set: { accessRevokedAt: at, accessRevokedOrderId: order._id } }, { session });
      if (result.modifiedCount !== 1) throw failure(409, 'Entitlement changed; reload');
    }
  }
}
async function transition(db, client, kind, id, body) {
  const allowed = kind === 'orders'
    ? ['status', 'note', 'trackingCode', 'restock']
    : ['status', 'note', 'refundAmount', 'restock'];
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !allowed.includes(key)) ||
      typeof body.status !== 'string' ||
      (body.note !== undefined && typeof body.note !== 'string') ||
      (body.trackingCode !== undefined && typeof body.trackingCode !== 'string') ||
      (body.refundAmount !== undefined && (typeof body.refundAmount !== 'number' || !Number.isFinite(body.refundAmount))))
    throw failure(400, 'Invalid status payload; unexpected fields or field types');
  if (!client) throw failure(503, "Transactional client unavailable");
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    throw failure(
      503,
      "Replica set or sharded transactions required; no writes performed",
    );
  if (!ObjectId.isValid(id)) throw failure(404, "Not found");
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const name = kind === "orders" ? "orders" : "return_requests";
        const collection = db.collection(name);
        const doc = await collection.findOne(
          { _id: new ObjectId(id) },
          { session },
        );
        if (!doc) throw failure(404, "Not found");
        owned(doc);
        const present = require(
          kind === "orders"
            ? "../routes/admin-orders"
            : "../routes/admin-returns",
        ).present;
        const current = present(doc),
          next = body.status;
        if (current.status === next) {
          if (
            next === "refunded" &&
            Number(body.refundAmount) !== doc.refundAmount
          )
            throw failure(409, "Refund already recorded with another amount");
          result = doc;
          return;
        }
        if (!current.nextStatuses.includes(next))
          throw failure(409, "Invalid or stale transition");
        if (body.restock !== undefined && typeof body.restock !== "boolean")
          throw failure(400, "restock must be boolean");
        const note =
          typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
        if (["cancelled", "rejected"].includes(next) && !note)
          throw failure(400, "Reason required");
        const now = new Date(),
          set = { status: next, updatedAt: now };
        if (kind === "orders") {
          if (next === "returned")
            throw failure(409, "Use the verified return-request workflow");
          if (next === "delivered" && current.paymentMethod === "cod") {
            set.paymentStatus = "paid";
            set.paidAt = now;
            set.paymentVerification = { source: 'cod_delivery', verifiedAt: now };
          }
          if (typeof body.trackingCode === "string" && body.trackingCode.trim())
            set.trackingCode = body.trackingCode.trim().slice(0, 100);
          if (next === 'cancelled' && current.paymentStatus !== 'unpaid')
            throw failure(409, 'Paid orders require the refund workflow');
          if (next === "cancelled" && !doc.restocked && (doc.stockDeducted === true || body.restock === true)) {
            if (doc.stockDeducted !== true)
              throw failure(409, "No verified stock deduction");
            if (await stockReturn(db, session, current.items))
              set.restocked = true;
          }
          if (next === 'cancelled' && doc.voucherCode && !doc.voucherReleased) {
            await releaseVoucher(db, session, doc);
            set.voucherReleased = true;
          }
        } else {
          if (next === "received" || next === "refunded") {
            if (!ObjectId.isValid(String(doc.orderId)))
              throw failure(409, "Verified original order required");
            const order = await db
              .collection("orders")
              .findOne({ _id: new ObjectId(String(doc.orderId)) }, { session });
            if (!order) throw failure(409, "Original order missing");
            owned(order);
            if (
              String(order.userId) !== String(doc.userId) ||
              !["delivered", "returned"].includes(order.status)
            )
              throw failure(409, "Original owner/status mismatch");
            const source = quantities(order.items || []),
              returned = quantities(doc.items || []);
            if (
              source.size !== returned.size ||
              [...source].some(([k, v]) => returned.get(k) !== v)
            )
              throw failure(
                409,
                "Partial return/refund policy requires approval",
              );
            if (
              next === "received" &&
              body.restock === true &&
              !doc.restocked
            ) {
              if (order.stockDeducted !== true || order.restocked === true)
                throw failure(409, "No unreturned stock deduction");
              if (await stockReturn(db, session, current.items)) {
                set.restocked = true;
                await db
                  .collection("orders")
                  .updateOne(
                    { _id: order._id },
                    { $set: { restocked: true, updatedAt: now } },
                    { session },
                  );
              }
            }
            if (next === "refunded") {
              const amount = Number(body.refundAmount);
              if (
                !Number.isFinite(amount) ||
                amount <= 0 ||
                amount !== current.itemsValue
              )
                throw failure(
                  409,
                  "Only full verified item-value refunds supported pending policy approval",
                );
              if (!verifiedPaymentDate(order))
                throw failure(
                  409,
                  "Thiếu bằng chứng thanh toán đã xác minh; cần đối soát thủ công trước khi hoàn tiền.",
                );
              // Shipping/discount refund allocation is deliberately not inferred.
              if (
                Number(order.shippingFee || 0) !== 0 ||
                Number(order.discount || 0) !== 0 ||
                Number(order.total) !== amount
              )
                throw failure(
                  409,
                  "Shipping/discount/partial refund allocation needs approval",
                );
              set.refundAmount = amount;
              const refunded = await db
                .collection("orders")
                .updateOne(
                  { _id: order._id, paymentStatus: "paid" },
                  {
                    $set: {
                      paymentStatus: "refunded",
                      status: "returned",
                      updatedAt: now,
                    },
                    $push: {
                      statusHistory: {
                        status: "returned",
                        at: now,
                        note: "Verified return " + String(doc._id),
                      },
                    },
                  },
                  { session },
                );
              if (refunded.modifiedCount !== 1) throw failure(409, 'Original payment changed; reload');
              await revokeEbooks(db, session, order, now);
            }
          }
        }
        const update = await collection.updateOne(
          { _id: doc._id, status: doc.status },
          {
            $set: set,
            $push: {
              statusHistory: { status: next, at: now, note: note || null },
            },
          },
          { session },
        );
        if (update.modifiedCount !== 1)
          throw failure(409, "Concurrent status change");
        result = await collection.findOne({ _id: doc._id }, { session });
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
module.exports = transition;
module.exports.adjustStock = adjustStock;
module.exports.releaseVoucher = releaseVoucher;
module.exports.verifiedPaymentDate = verifiedPaymentDate;
module.exports.ebookEntitlementOrder = ebookEntitlementOrder;
module.exports.hasEbookEntitlement = hasEbookEntitlement;
module.exports.freeEbookClaimId = freeEbookClaimId;
