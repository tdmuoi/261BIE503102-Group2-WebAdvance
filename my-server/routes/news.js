// =====================================================================
// API Lightbook News   (gắn vào index.js: app.use('/api', newsRoutes(() => database)))
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');

const { publishedFilter } = require('./news-policy');
const SORT = { publishedAt: -1, createdAt: -1 };
const POPULAR_SORT = { views: -1, ...SORT };
const WORDS_PER_MINUTE = 200;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readMinutes(content) {
  const words = String(content || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function present({ content, ...doc }, withContent) {
  return withContent ? { ...doc, content, readMinutes: readMinutes(content) } : { ...doc, readMinutes: readMinutes(content) };
}

module.exports = function newsRoutes(getDb) {
  const router = express.Router();
  const news = () => getDb().collection('news');
  router.use('/admin/news', require('./admin-news')(getDb));

  router.get('/news', async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);
      const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

      const filter = { ...publishedFilter() };
      if (req.query.category) filter.category = String(req.query.category);
      const search = String(req.query.search || '').trim();
      if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i');
        filter.$and = [{ $or: [{ title: pattern }, { desc: pattern }, { content: pattern }] }];
      }

      const [items, total, categories] = await Promise.all([
        news().find(filter).sort(req.query.sort === 'popular' ? POPULAR_SORT : SORT).skip(skip).limit(limit).toArray(),
        news().countDocuments(filter),
        news().distinct('category', publishedFilter()),
      ]);

      res.json({
        items: items.map((doc) => present(doc, false)),
        total,
        categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
      });
    } catch (error) {
      console.error('GET /api/news failed:', error.message);
      res.status(500).json({ message: 'Cannot retrieve news' });
    }
  });

  router.get('/news/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const keys = [{ id }];
      if (ObjectId.isValid(id)) keys.push({ _id: new ObjectId(id) });

      const doc = await news().findOne({ $and: [publishedFilter(), { $or: keys }] });
      if (!doc) return res.status(404).json({ message: 'News not found' });

      res.json(present(doc, true));
    } catch (error) {
      console.error('GET /api/news/:id failed:', error.message);
      res.status(500).json({ message: 'Cannot retrieve news' });
    }
  });

  return router;
};
