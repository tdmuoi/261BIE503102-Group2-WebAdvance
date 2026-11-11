// =====================================================================
// Wishlist của web khách hàng (bắt buộc đăng nhập)
//   GET    /api/wishlist           sách trong wishlist (kèm giá hiện tại, giảm giá, tác giả)
//   POST   /api/wishlist/:bookId   thêm (không trùng)
//   DELETE /api/wishlist/:bookId   bỏ
// Collection wishlists: mỗi người một dòng { userId, items: [{ bookId, addedAt }], updatedAt }
// =====================================================================
const express = require('express');
const { requireCustomer, toObjectId } = require('../middleware/customer-auth');

module.exports = function customerWishlistRoutes(getDb) {
  const router = express.Router();
  const db = () => getDb();
  const auth = requireCustomer(getDb);
  const wishlists = () => db().collection('wishlists');

  async function view(userId) {
    const doc = await wishlists().findOne({ userId });
    const items = doc?.items || [];
    const books = await db().collection('books').find({ _id: { $in: items.map((i) => i.bookId) } }).toArray();
    const authors = await db().collection('authors')
      .find({ _id: { $in: books.map((b) => b.authorId).filter(Boolean) } }, { projection: { name: 1 } }).toArray();
    const authorName = new Map(authors.map((a) => [String(a._id), a.name]));
    const byId = new Map(books.map((b) => [String(b._id), b]));
    return items
      .filter((i) => byId.has(String(i.bookId)))
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      .map((i) => {
        const b = byId.get(String(i.bookId));
        return {
          bookId: String(b._id), title: b.title, image: b.image || '', price: Number(b.price) || 0,
          originalPrice: Number(b.originalPrice) || Number(b.price) || 0, discountPercent: Number(b.discountPercent) || 0,
          author: (b.authorId && authorName.get(String(b.authorId))) || (b.authorNames || []).join(', ') || '',
          type: b.bookType || 'new', stock: typeof b.stock === 'number' ? b.stock : null,
          addedAt: i.addedAt ? new Date(i.addedAt).toISOString() : null,
        };
      });
  }

  router.get('/wishlist', auth, async (req, res, next) => {
    try {
      res.json(await view(req.customer.userId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/wishlist/:bookId', auth, async (req, res, next) => {
    try {
      const bookId = toObjectId(req.params.bookId);
      if (!bookId || !(await db().collection('books').findOne({ _id: bookId }, { projection: { _id: 1 } }))) {
        return res.status(404).json({ message: 'Không tìm thấy sách' });
      }
      const userId = req.customer.userId;
      const now = new Date();
      await wishlists().updateOne({ userId }, { $setOnInsert: { userId, items: [], createdAt: now } }, { upsert: true });
      await wishlists().updateOne(
        { userId, 'items.bookId': { $ne: bookId } },
        { $push: { items: { $each: [{ bookId, addedAt: now }], $slice: -200 } }, $set: { updatedAt: now } },
      );
      res.status(201).json(await view(userId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/wishlist/:bookId', auth, async (req, res, next) => {
    try {
      const bookId = toObjectId(req.params.bookId);
      const userId = req.customer.userId;
      if (bookId) await wishlists().updateOne({ userId }, { $pull: { items: { bookId } }, $set: { updatedAt: new Date() } });
      res.json(await view(userId));
    } catch (error) {
      next(error);
    }
  });

  return router;
};
