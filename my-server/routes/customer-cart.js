'use strict';
const express = require('express');
const { ObjectId } = require('mongodb');
const { requireCustomer } = require('../middleware/customer-auth');
const fail = (status, message) => Object.assign(new Error(message), { status });

async function cartView(db, row) {
  const items = row?.items || [];
  const books = await db.collection('books').find({ _id: { $in: items.map(i => new ObjectId(i.bookId)) } },
    { projection: { title: 1, image: 1, price: 1 } }).toArray();
  const catalog = new Map(books.map(b => [String(b._id), b]));
  return { revision: row?.revision ?? null, items: items.map(item => {
    const b = catalog.get(item.bookId);
    return { ...item, title: b?.title || 'Sách không còn trong danh mục', image: b?.image || '', price: b?.price || 0 };
  }) };
}

module.exports = function customerCart(getDb) {
  const router = express.Router();
  router.use('/cart', requireCustomer(getDb), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/cart', async (req, res, next) => {
    try { res.json(await cartView(getDb(), await getDb().collection('carts').findOne({ _id: req.customer.userId }))); }
    catch (error) { next(error); }
  });
  router.put('/cart', async (req, res, next) => {
    try {
      const body = req.body;
      if (!body || Object.keys(body).some(k => !['items', 'revision'].includes(k)) || !Array.isArray(body.items) ||
          body.items.length > 100 || !(body.revision === null || Number.isSafeInteger(body.revision) && body.revision > 0 && body.revision < Number.MAX_SAFE_INTEGER))
        throw fail(400, 'Giỏ hàng hoặc phiên bản giỏ hàng không hợp lệ.');
      const items = body.items.map(i => {
        if (!i || typeof i.bookId !== 'string' || !/^[a-f\d]{24}$/i.test(i.bookId) || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 999)
          throw fail(400, 'Mã sách hoặc số lượng không hợp lệ (1–999).');
        return { bookId: i.bookId.toLowerCase(), quantity: i.quantity };
      });
      if (new Set(items.map(i => i.bookId)).size !== items.length) throw fail(400, 'Sách trong giỏ bị trùng.');
      const db = getDb();
      if (items.length) {
        const available = await db.collection('books').countDocuments({ _id: { $in: items.map(i => new ObjectId(i.bookId)) },
          status: 'active', isDemo: { $ne: true } });
        if (available !== items.length) throw fail(409, 'Một số sách không còn được bán. Vui lòng cập nhật giỏ hàng.');
      }
      const now = new Date();
      const row = await db.collection('carts').findOneAndUpdate({ _id: req.customer.userId, revision: body.revision },
        { $set: { userId: req.customer.userId, items, updatedAt: now, revision: (body.revision ?? 0) + 1 }, $setOnInsert: { createdAt: now } },
        { upsert: body.revision === null, returnDocument: 'after' });
      if (!row) throw fail(409, 'Giỏ hàng đã thay đổi trên thiết bị khác. Vui lòng tải lại.');
      res.json(await cartView(db, row));
    } catch (error) {
      if (error.code === 11000) return next(fail(409, 'Giỏ hàng đã thay đổi trên thiết bị khác. Vui lòng tải lại.'));
      next(error);
    }
  });
  return router;
};
