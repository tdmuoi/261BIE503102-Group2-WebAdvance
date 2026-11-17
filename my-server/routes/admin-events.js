const express = require('express');
const { ObjectId } = require('mongodb');
const createAuth = require('../middleware/admin-auth');
const revisions = require('../middleware/admin-revision');

const text = value => typeof value === 'string' ? value.trim() : '';
const iso = value => value && Number.isFinite(+new Date(value)) ? new Date(value).toISOString() : null;
const statuses = ['draft', 'published', 'hidden'];
const fail = (status, message, errors) => Object.assign(new Error(message), { status, errors });
function present(doc) {
  return {
    _id: String(doc._id), eventCode: text(doc.eventCode), title: text(doc.title),
    description: text(doc.description), status: doc.status, startAt: iso(doc.startAt), endAt: iso(doc.endAt),
    authorId: doc.authorId == null ? null : String(doc.authorId),
    guests: Array.isArray(doc.guests) ? doc.guests.filter(value => typeof value === 'string') : [],
    location: text(doc.location), format: doc.format || 'offline', type: text(doc.type), image: text(doc.image),
    capacity: doc.capacity ?? null, registeredCount: doc.registeredCount ?? 0, isDemo: doc.isDemo === true,
    revision: revisions.revision(doc),
  };
}

module.exports = function adminEvents(getDb) {
  const router = express.Router(), auth = createAuth(getDb);
  const events = () => getDb().collection('events');
  router.use(auth.cors, auth.requireAdmin);
  router.use((req, res, next) => auth.requirePermission('content',
    ['GET', 'HEAD'].includes(req.method) ? 'view' : req.method === 'POST' ? 'create' : 'update')(req, res, next));
  const handle = (res, error) => res.status(error.status || 503).json({
    message: error.status ? error.message : 'Không đọc hoặc lưu được sự kiện. Vui lòng thử lại.',
    ...(error.errors ? { errors: error.errors } : {}),
  });

  router.get('/', async (req, res) => {
    try {
      const page = Number(req.query.page ?? 1), limit = 20;
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw fail(400, 'Trang không hợp lệ.');
      const filter = {};
      if (req.query.status) {
        if (!statuses.includes(req.query.status)) throw fail(400, 'Trạng thái không hợp lệ.');
        filter.status = req.query.status;
      }
      if (req.query.search != null && (typeof req.query.search !== 'string' || req.query.search.length > 200))
        throw fail(400, 'Từ khóa tối đa 200 ký tự.');
      const search = text(req.query.search);
      if (search) filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const [items, total] = await Promise.all([
        events().find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        events().countDocuments(filter),
      ]);
      res.json({ items: items.map(present), total, page, limit });
    } catch (error) { handle(res, error); }
  });

  router.get('/:id', async (req, res) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw fail(404, 'Không tìm thấy sự kiện.');
      const doc = await events().findOne({ _id: new ObjectId(req.params.id) });
      if (!doc) throw fail(404, 'Không tìm thấy sự kiện.');
      res.json(present(doc));
    } catch (error) { handle(res, error); }
  });

  async function save(req, res) {
    try {
      const body = req.body;
      const allowed = ['title', 'description', 'status', 'startAt', 'endAt', 'authorId', 'guests',
        'location', 'format', 'type', 'image', 'capacity', 'revision'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)))
        throw fail(400, 'Dữ liệu chứa trường không được phép.');
      let existing = null;
      if (req.method === 'PUT') {
        if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw fail(404, 'Không tìm thấy sự kiện.');
        existing = await events().findOne({ _id: new ObjectId(req.params.id) });
        if (!existing) throw fail(404, 'Không tìm thấy sự kiện.');
        if (existing.isDemo === true) throw fail(409, 'Sự kiện demo chỉ đọc. Hãy tạo sự kiện mới với nội dung đã xác nhận.');
        revisions.requireRevision(body, existing);
      }
      // Editing already-public content, including unpublishing, also requires publish permission.
      if (body.status === 'published' || existing?.status === 'published') {
        let permitted = false;
        auth.requirePermission('content', 'publish')(req, res, () => { permitted = true; });
        if (!permitted) return;
      }
      const errors = {};
      const data = Object.fromEntries(['title', 'description', 'location', 'type', 'image'].map(key => [key, text(body[key])]));
      for (const [key, max] of [['title', 200], ['description', 4000], ['location', 500], ['type', 80], ['image', 2000]]) {
        if (typeof body[key] !== 'string' || data[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(data[key]))
          errors[key] = `Thông tin không hợp lệ hoặc vượt ${max} ký tự.`;
      }
      if (!data.title) errors.title = 'Vui lòng nhập tên sự kiện.';
      if (!statuses.includes(body.status)) errors.status = 'Trạng thái không hợp lệ.';
      data.status = body.status;
      if (!['online', 'offline'].includes(body.format)) errors.format = 'Chọn hình thức tổ chức.';
      data.format = body.format;
      for (const key of ['startAt', 'endAt']) {
        data[key] = null;
        if (body[key] != null) {
          const date = typeof body[key] === 'string' ? new Date(body[key]) : new Date(NaN);
          if (!Number.isFinite(+date) || date.toISOString() !== body[key]) errors[key] = 'Ngày giờ không hợp lệ.';
          else data[key] = date;
        }
      }
      if (data.endAt && (!data.startAt || data.endAt <= data.startAt)) errors.endAt = 'Giờ kết thúc phải sau giờ bắt đầu.';
      data.guests = body.guests;
      if (!Array.isArray(body.guests) || body.guests.length > 10 || body.guests.some(value => typeof value !== 'string' || !value.trim() || value.length > 120))
        errors.guests = 'Tối đa 10 khách mời, mỗi tên tối đa 120 ký tự.';
      else data.guests = [...new Set(body.guests.map(text))];
      data.capacity = body.capacity;
      if (body.capacity !== null && (!Number.isSafeInteger(body.capacity) || body.capacity < 1 || body.capacity > 100000))
        errors.capacity = 'Sức chứa từ 1 đến 100.000, hoặc để trống.';
      const registered = existing?.registeredCount ?? 0;
      if (!Number.isSafeInteger(registered) || registered < 0) throw fail(409, 'Số đăng ký đã lưu cần được đối soát trước khi sửa.');
      if (Number.isSafeInteger(data.capacity) && data.capacity < registered) errors.capacity = 'Sức chứa không được nhỏ hơn số người đã đăng ký.';
      data.authorId = null;
      if (body.authorId != null) {
        if (typeof body.authorId !== 'string' || !/^[a-f\d]{24}$/i.test(body.authorId)) errors.authorId = 'Tác giả không hợp lệ.';
        else {
          const author = await getDb().collection('authors').findOne({
            _id: { $in: [new ObjectId(body.authorId), body.authorId] }, status: 'active',
          });
          if (!author) errors.authorId = 'Không tìm thấy tác giả đang hoạt động.';
          else data.authorId = author._id;
        }
      }
      if (data.image) {
        try {
          if (/[\s\\]/.test(data.image) || data.image.startsWith('//')) throw new Error();
          const url = new URL(data.image, 'http://localhost');
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
              (!data.image.startsWith('/') && !/^https?:\/\//i.test(data.image))) throw new Error();
        } catch { errors.image = 'Dùng URL ảnh http(s) hoặc đường dẫn / hợp lệ.'; }
      }
      if (data.status === 'published') {
        if (!data.startAt) errors.startAt = 'Cần lịch tổ chức trước khi xuất bản.';
        if (!data.description) errors.description = 'Cần mô tả trước khi xuất bản.';
        if (!data.location) errors.location = 'Cần địa điểm hoặc đường dẫn tham gia.';
        if (!data.authorId && !data.guests?.length) errors.authorId = 'Chọn tác giả hoặc nhập khách mời trước khi xuất bản.';
      }
      if (Object.keys(errors).length) throw fail(400, 'Vui lòng kiểm tra thông tin sự kiện.', errors);
      const now = existing ? revisions.nextUpdatedAt(existing) : new Date();
      if (existing) {
        const result = await events().updateOne({ _id: existing._id, isDemo: { $ne: true },
          ...revisions.snapshot(existing), registeredCount: Object.hasOwn(existing, 'registeredCount') ? existing.registeredCount : { $exists: false } },
        { $set: { ...data, updatedAt: now } });
        if (!result.matchedCount) throw revisions.conflict();
        return res.json(present({ ...existing, ...data, updatedAt: now }));
      }
      const _id = new ObjectId();
      const doc = { _id, eventCode: `EVENT-${String(_id).toUpperCase()}`, ...data, registeredCount: 0, createdAt: now, updatedAt: now };
      await events().insertOne(doc);
      res.status(201).json(present(doc));
    } catch (error) { handle(res, error); }
  }
  router.post('/', save);
  router.put('/:id', save);
  return router;
};
