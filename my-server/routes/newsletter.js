// =====================================================================
// API đăng ký nhận bản tin   (gắn vào index.js: app.use('/api', newsletterRoutes(() => database)))
//
//   POST /api/newsletter   body { email, topic }   topic: 'news' | 'events'
//     → 201 đăng ký mới · 200 email đã có, thêm chủ đề mới
//     → 409 email đã đăng ký chủ đề này · 400 email hoặc chủ đề không hợp lệ
//
// Collection newsletters: mỗi email một dòng { email, topics, createdAt }.
// Email unique nhờ index tạo lúc khởi động server (xem startServer trong index.js).
// =====================================================================
const express = require('express');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const TOPICS = ['news', 'events'];
const DUPLICATE_KEY = 11000;

module.exports = function newsletterRoutes(getDb) {
  const router = express.Router();

  router.post('/newsletter', async (req, res) => {
    const { email, topic } = req.body ?? {};
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (address.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(address) || !TOPICS.includes(topic)) {
      return res.status(400).json({ message: 'Email hoặc chủ đề không hợp lệ' });
    }

    const alreadySubscribed = () => res.status(409).json({ message: 'Email này đã đăng ký nhận bản tin' });
    try {
      const result = await getDb().collection('newsletters').updateOne(
        { email: address },
        { $addToSet: { topics: topic }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      if (result.upsertedCount) return res.status(201).json({ message: 'Đăng ký thành công' });
      if (result.modifiedCount) return res.json({ message: 'Đăng ký thành công' });
      return alreadySubscribed();
    } catch (error) {
      // Hai yêu cầu cùng email đến một lúc: yêu cầu sau vướng index unique
      if (error.code === DUPLICATE_KEY) return alreadySubscribed();
      console.error('POST /api/newsletter failed:', error.message);
      return res.status(500).json({ message: 'Cannot subscribe to newsletter' });
    }
  });

  return router;
};
