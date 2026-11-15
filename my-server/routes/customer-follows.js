'use strict';
// =====================================================================
// Theo dõi tác giả (cần đăng nhập), collection "author_follows":
//   GET    /api/account/followed-authors              → ["<authorId>", …]
//   PUT    /api/account/followed-authors/:authorId    theo dõi (gọi lại nhiều lần vẫn chỉ 1 bản ghi)
//   DELETE /api/account/followed-authors/:authorId    bỏ theo dõi
// _id = "<userId>:<authorId>" nên mỗi khách chỉ theo dõi 1 tác giả 1 lần, không cần unique index.
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');
const { requireCustomer } = require('../middleware/customer-auth');

module.exports = function customerFollows(getDb) {
  const router = express.Router();
  const auth = requireCustomer(getDb);
  const follows = () => getDb().collection('author_follows');
  const followId = (userId, authorId) => `${String(userId)}:${authorId}`;

  /** Tác giả đang hiển thị trên web (DB lưu _id dạng ObjectId hoặc chuỗi) */
  async function findAuthor(id) {
    const keys = [id];
    if (ObjectId.isValid(id)) keys.push(new ObjectId(id));
    return getDb().collection('authors').findOne({ _id: { $in: keys }, status: 'active' }, { projection: { _id: 1 } });
  }

  router.get('/account/followed-authors', auth, async (req, res, next) => {
    try {
      const rows = await follows().find({ userId: req.customer.userId }, { projection: { authorId: 1 } }).toArray();
      res.json(rows.map((row) => row.authorId));
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/followed-authors/:authorId', auth, async (req, res, next) => {
    try {
      const authorId = String(req.params.authorId).trim();
      if (!authorId || authorId.length > 64 || !(await findAuthor(authorId))) {
        return res.status(404).json({ message: 'Không tìm thấy tác giả' });
      }
      const userId = req.customer.userId;
      await follows().updateOne(
        { _id: followId(userId, authorId) },
        { $setOnInsert: { userId, authorId, createdAt: new Date() } },
        { upsert: true },
      );
      res.json({ authorId, following: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/account/followed-authors/:authorId', auth, async (req, res, next) => {
    try {
      const authorId = String(req.params.authorId).trim();
      await follows().deleteOne({ _id: followId(req.customer.userId, authorId) });
      res.json({ authorId, following: false });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
