// =====================================================================
// API Lightbook News   (gắn vào index.js: app.use('/api', newsRoutes(() => database)))
//
// Cho web khách (my-app), CHỈ ĐỌC, chỉ trả bài có status "published":
//   GET /api/news                    danh sách bài, mới nhất trước
//       ?category=Ebook              lọc theo chuyên mục (đúng tên trong DB)
//       ?search=sách cũ              tìm trong tiêu đề, mô tả, nội dung (không phân biệt hoa thường)
//       ?limit=9&skip=0              phân trang cho nút "Xem thêm" (limit mặc định 9, tối đa 50)
//     → { items, total, categories }  items không kèm content; categories = chuyên mục của mọi bài đã đăng
//   GET /api/news/:id                một bài (tìm theo _id hoặc field id), bài chưa đăng trả 404
//
// readMinutes: số phút đọc ước tính từ độ dài nội dung (200 từ/phút).
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');

const PUBLISHED = { status: 'published' };
const SORT = { publishedAt: -1, createdAt: -1 };
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

  router.get('/news', async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);
      const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

      const filter = { ...PUBLISHED };
      if (req.query.category) filter.category = String(req.query.category);
      const search = String(req.query.search || '').trim();
      if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ title: pattern }, { desc: pattern }, { content: pattern }];
      }

      const [items, total, categories] = await Promise.all([
        news().find(filter).sort(SORT).skip(skip).limit(limit).toArray(),
        news().countDocuments(filter),
        news().distinct('category', PUBLISHED),
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

      const doc = await news().findOne({ ...PUBLISHED, $or: keys });
      if (!doc) return res.status(404).json({ message: 'News not found' });

      res.json(present(doc, true));
    } catch (error) {
      console.error('GET /api/news/:id failed:', error.message);
      res.status(500).json({ message: 'Cannot retrieve news' });
    }
  });

  return router;
};
