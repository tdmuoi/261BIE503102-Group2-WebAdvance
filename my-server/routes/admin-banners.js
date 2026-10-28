// =====================================================================
// API Banner & quảng cáo   (gắn vào index.js: app.use('/api', bannersRoutes(() => database)))
//
// Cho web khách (my-app):
//   GET    /api/banners?position=hero     banner đang bật và trong thời gian chạy, theo thứ tự
//
// Cho admin (my-admin):
//   GET    /api/admin/banners             tất cả banner + số đếm theo trạng thái
//   POST   /api/admin/banners             thêm banner
//   PUT    /api/admin/banners/:id         sửa banner
//   PATCH  /api/admin/banners/:id         bật/tắt nhanh: { active: true | false }
//   PATCH  /api/admin/banners/reorder     đổi thứ tự trong 1 vị trí: { ids: [id1, id2, ...] }
//   DELETE /api/admin/banners/:id         xoá banner
//
// Trạng thái (state) tính lúc gọi API:
//   live = đang hiển thị | scheduled = chưa tới ngày bắt đầu | expired = đã qua ngày kết thúc | off = admin tắt
// Ngày nhập từ form là ngày giờ Việt Nam (UTC+7): bắt đầu 00:00, kết thúc 23:59 của ngày đó.
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');

const POSITIONS = ['hero', 'flash_sale', 'promo_strip'];
const STATES = ['live', 'scheduled', 'expired', 'off'];
const VN_OFFSET = '+07:00';

class ValidationError extends Error {
  constructor(errors) {
    super('Invalid banner data');
    this.errors = errors;
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 'YYYY-MM-DD' -> Date theo giờ VN; endOfDay = 23:59:59.999 */
function parseDay(value, endOfDay = false) {
  const text = cleanText(value).slice(0, 10);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const d = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${VN_OFFSET}`);
  return isNaN(d.getTime()) ? undefined : d;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Chấp nhận vài tên field khác (nếu dữ liệu cũ đặt tên khác) và tính state */
function present(doc, now = new Date()) {
  const active = doc.active ?? doc.isActive ?? (doc.status ? doc.status === 'active' : true);
  const startDate = toDate(doc.startDate ?? doc.startAt);
  const endDate = toDate(doc.endDate ?? doc.endAt);
  let state = 'live';
  if (!active) state = 'off';
  else if (startDate && startDate > now) state = 'scheduled';
  else if (endDate && endDate < now) state = 'expired';

  return {
    _id: String(doc._id),
    name: doc.name ?? doc.title ?? '',
    title: doc.title ?? '',
    subtitle: doc.subtitle ?? doc.description ?? '',
    image: doc.image ?? doc.imageUrl ?? doc.img ?? null,
    link: doc.link ?? doc.url ?? '',
    bgColor: doc.bgColor ?? '#1c1917',
    textColor: doc.textColor ?? '#ffffff',
    position: POSITIONS.includes(doc.position) ? doc.position : 'hero',
    order: Number.isFinite(doc.order) ? doc.order : 9999, // chưa có thứ tự thì xếp cuối
    active: !!active,
    startDate,
    endDate,
    state,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

function parseBanner(body) {
  const errors = {};
  const name = cleanText(body.name);
  const title = cleanText(body.title);
  const image = cleanText(body.image);
  const link = cleanText(body.link);
  const position = cleanText(body.position) || 'hero';
  const bgColor = cleanText(body.bgColor) || '#1c1917';
  const textColor = cleanText(body.textColor) || '#ffffff';
  const startDate = parseDay(body.startDate);
  const endDate = parseDay(body.endDate, true);

  if (!name) errors.name = 'Vui lòng đặt tên banner';
  if (!title && !image) errors.title = 'Cần có tiêu đề hoặc ảnh banner';
  if (image && !/^(https?:\/\/|\/|images\/)/i.test(image)) errors.image = 'Link ảnh phải bắt đầu bằng http(s):// hoặc /';
  if (link && !/^(https?:\/\/|\/)/i.test(link)) errors.link = 'Link phải bắt đầu bằng / (trang trong web) hoặc http(s)://';
  if (!POSITIONS.includes(position)) errors.position = 'Vị trí không hợp lệ';
  if (!/^#[0-9a-f]{6}$/i.test(bgColor)) errors.bgColor = 'Màu nền không hợp lệ';
  if (!/^#[0-9a-f]{6}$/i.test(textColor)) errors.textColor = 'Màu chữ không hợp lệ';
  if (startDate === undefined) errors.startDate = 'Ngày bắt đầu không hợp lệ';
  if (endDate === undefined) errors.endDate = 'Ngày kết thúc không hợp lệ';
  if (startDate && endDate && endDate < startDate) errors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu';

  if (Object.keys(errors).length) throw new ValidationError(errors);

  return {
    name,
    title,
    subtitle: cleanText(body.subtitle),
    image: image || null,
    link,
    bgColor,
    textColor,
    position,
    active: body.active !== false,
    startDate,
    endDate,
  };
}

function handleError(res, error, action) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ message: 'Dữ liệu chưa hợp lệ', errors: error.errors });
  }
  console.error(`${action} failed:`, error.message);
  return res.status(500).json({ message: 'Lỗi server, vui lòng thử lại' });
}

module.exports = function bannersRoutes(getDb) {
  const router = express.Router();
  const banners = () => getDb().collection('banners');
  const sortByOrder = (list) =>
    list.sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.order - b.order);

  // ---------- Web khách ----------
  router.get('/banners', async (req, res) => {
    try {
      const now = new Date();
      const list = (await banners().find({}).toArray())
        .map((doc) => present(doc, now))
        .filter((b) => b.state === 'live' && (!req.query.position || b.position === req.query.position));
      res.json(
        sortByOrder(list).map(({ _id, title, subtitle, image, link, bgColor, textColor, position }) => ({
          _id, title, subtitle, image, link, bgColor, textColor, position,
        })),
      );
    } catch (error) {
      handleError(res, error, 'GET /api/banners');
    }
  });

  // ---------- Admin: danh sách ----------
  router.get('/admin/banners', async (req, res) => {
    try {
      const list = sortByOrder((await banners().find({}).toArray()).map((doc) => present(doc)));
      const counts = Object.fromEntries(STATES.map((s) => [s, list.filter((b) => b.state === s).length]));
      res.json({ items: list, counts: { all: list.length, ...counts }, positions: POSITIONS });
    } catch (error) {
      handleError(res, error, 'GET /api/admin/banners');
    }
  });

  // ---------- Admin: đổi thứ tự (đặt trước /:id) ----------
  router.patch('/admin/banners/reorder', async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => ObjectId.isValid(id)) : [];
      if (!ids.length) return res.status(400).json({ message: 'Cần gửi danh sách ids theo thứ tự mới' });
      await Promise.all(
        ids.map((id, index) => banners().updateOne({ _id: new ObjectId(String(id)) }, { $set: { order: index + 1 } })),
      );
      res.json({ reordered: ids.length });
    } catch (error) {
      handleError(res, error, 'PATCH /api/admin/banners/reorder');
    }
  });

  // ---------- Admin: thêm ----------
  router.post('/admin/banners', async (req, res) => {
    try {
      const data = parseBanner(req.body || {});
      const last = await banners().find({ position: data.position }).sort({ order: -1 }).limit(1).toArray();
      const doc = { ...data, order: (last[0]?.order ?? 0) + 1, createdAt: new Date(), updatedAt: new Date() };
      const result = await banners().insertOne(doc);
      res.status(201).json(present({ _id: result.insertedId, ...doc }));
    } catch (error) {
      handleError(res, error, 'POST /api/admin/banners');
    }
  });

  // ---------- Admin: sửa ----------
  router.put('/admin/banners/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy banner' });
      const _id = new ObjectId(req.params.id);
      const existing = await banners().findOne({ _id });
      if (!existing) return res.status(404).json({ message: 'Không tìm thấy banner' });

      const data = parseBanner(req.body || {});
      const update = { ...data, updatedAt: new Date() };
      // Đổi sang vị trí khác thì xếp xuống cuối vị trí mới
      if (data.position !== existing.position) {
        const last = await banners().find({ position: data.position }).sort({ order: -1 }).limit(1).toArray();
        update.order = (last[0]?.order ?? 0) + 1;
      }
      await banners().updateOne({ _id }, { $set: update });
      res.json(present(await banners().findOne({ _id })));
    } catch (error) {
      handleError(res, error, 'PUT /api/admin/banners/:id');
    }
  });

  // ---------- Admin: bật / tắt nhanh ----------
  router.patch('/admin/banners/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id) || typeof req.body?.active !== 'boolean') {
        return res.status(400).json({ message: 'Cần gửi { active: true | false }' });
      }
      const _id = new ObjectId(req.params.id);
      const result = await banners().updateOne({ _id }, { $set: { active: req.body.active, updatedAt: new Date() } });
      if (!result.matchedCount) return res.status(404).json({ message: 'Không tìm thấy banner' });
      res.json(present(await banners().findOne({ _id })));
    } catch (error) {
      handleError(res, error, 'PATCH /api/admin/banners/:id');
    }
  });

  // ---------- Admin: xoá ----------
  router.delete('/admin/banners/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy banner' });
      const result = await banners().deleteOne({ _id: new ObjectId(req.params.id) });
      if (!result.deletedCount) return res.status(404).json({ message: 'Không tìm thấy banner' });
      res.json({ deleted: true });
    } catch (error) {
      handleError(res, error, 'DELETE /api/admin/banners/:id');
    }
  });

  return router;
};
