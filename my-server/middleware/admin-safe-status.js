"use strict";
const { ObjectId } = require("mongodb");
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
    result.set(id, (result.get(id) || 0) + item.quantity);
  }
  return result;
}
async function stockReturn(db, session, items) {
  let count = 0;
  for (const [id, qty] of quantities(items)) {
    const book = await db
      .collection("books")
      .findOne({ _id: new ObjectId(id) }, { session });
    if (!book) throw failure(409, "Book missing");
    if (book.bookType === "ebook") continue;
    if (
      !["new", "used"].includes(book.bookType) ||
      !Number.isSafeInteger(book.stock) ||
      book.stock < 0
    )
      throw failure(409, "Physical stock is not verified");
    const changed = await db
      .collection("books")
      .updateOne(
        { _id: book._id, bookType: book.bookType, stock: book.stock },
        { $inc: { stock: qty } },
        { session },
      );
    if (changed.modifiedCount !== 1)
      throw failure(409, "Stock changed; reload");
    count++;
  }
  return count;
}
async function transition(db, client, kind, id, body) {
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
          if (next === "delivered" && current.paymentMethod === "cod")
            set.paymentStatus = "paid";
          if (typeof body.trackingCode === "string" && body.trackingCode.trim())
            set.trackingCode = body.trackingCode.trim().slice(0, 100);
          if (next === "cancelled" && body.restock === true && !doc.restocked) {
            if (doc.stockDeducted !== true)
              throw failure(409, "No verified stock deduction");
            if (await stockReturn(db, session, current.items))
              set.restocked = true;
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
              if (order.paymentStatus !== "paid")
                throw failure(
                  409,
                  "Original payment must be paid and not already refunded",
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
              await db
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
