// =====================================================================
// API Sự kiện giao lưu   (gắn vào index.js: app.use('/api', eventsRoutes(() => database)))
//
// Cho web khách (my-app), CHỈ ĐỌC, chỉ trả sự kiện có status "published" và đã có ngày (startAt):
//   GET /api/events                  tất cả, sắp diễn ra trước (gần nhất trước), rồi đã diễn ra (mới nhất trước)
//       ?when=upcoming               chỉ sự kiện chưa bắt đầu (startAt >= hiện tại)
//       ?when=past                   chỉ sự kiện đã diễn ra (startAt < hiện tại)
//       ?authorId=<id>               chỉ sự kiện của một tác giả
//       ?limit=20                    số sự kiện tối đa (mặc định 50, tối đa 200)
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = function eventsRoutes(getDb) {
  const router = express.Router();
  const events = () => getDb().collection('events');

  router.get('/events', async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const now = new Date();

      const filter = { status: 'published', startAt: { $ne: null } };
      if (req.query.authorId) {
        const authorId = String(req.query.authorId);
        filter.authorId = ObjectId.isValid(authorId) ? { $in: [authorId, new ObjectId(authorId)] } : authorId;
      }

      const upcoming = () => events().find({ ...filter, startAt: { $gte: now } }).sort({ startAt: 1 }).limit(limit).toArray();
      const past = () => events().find({ ...filter, startAt: { $lt: now } }).sort({ startAt: -1 }).limit(limit).toArray();

      if (req.query.when === 'upcoming') return res.json(await upcoming());
      if (req.query.when === 'past') return res.json(await past());

      const [next, done] = await Promise.all([upcoming(), past()]);
      res.json([...next, ...done].slice(0, limit));
    } catch (error) {
      console.error('GET /api/events failed:', error.message);
      res.status(500).json({ message: 'Cannot retrieve events' });
    }
  });

  return router;
};
