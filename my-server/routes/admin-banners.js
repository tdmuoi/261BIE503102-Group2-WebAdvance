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
const revisions = require('../middleware/admin-revision');
const transaction = require('../middleware/admin-transaction');

const POSITIONS = ['hero', 'flash_sale', 'promo_strip', 'home_secondary'];
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
  const text = cleanText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const d = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${VN_OFFSET}`);
  return isNaN(d.getTime()) || new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== text ? undefined : d;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function safeUrl(value, image = false) {
  if (!value) return true;
  if (typeof value !== 'string' || value.length > 2000 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value) || (image && /^images\//.test(value))) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
function activeFields(doc, active) {
  const set = {};
  if (Object.hasOwn(doc, 'status')) set.status = active ? 'active' : 'inactive';
  if (Object.hasOwn(doc, 'isActive')) set.isActive = active;
  if (Object.hasOwn(doc, 'active') || !Object.keys(set).length) set.active = active;
  return set;
}
const dayOf = value => toDate(value) && new Date(+toDate(value) + 7 * 3600000).toISOString().slice(0, 10);
const orderFields = (doc, order) => ({
  ...(Object.hasOwn(doc, 'sortOrder') ? { sortOrder: order } : {}),
  ...(Object.hasOwn(doc, 'order') || !Object.hasOwn(doc, 'sortOrder') ? { order } : {}),
});

/** Chấp nhận vài tên field khác (nếu dữ liệu cũ đặt tên khác) và tính state */
function present(doc, now = new Date()) {
  const active = doc.active ?? doc.isActive ?? (doc.status ? doc.status === 'active' : true);
  const startDate = toDate(doc.startDate ?? doc.startAt);
  const endDate = toDate(doc.endDate ?? doc.endAt);
  let state = 'live';
  if (!active) state = 'off';
  else if (startDate && startDate > now) state = 'scheduled';
  else if (endDate && endDate < now) state = 'expired';
  const invalidDates = ['startDate', 'startAt', 'endDate', 'endAt'].filter(key => doc[key] != null && !toDate(doc[key]));
  if (invalidDates.length || (startDate && endDate && endDate < startDate)) state = 'off';
  const activeValues = [doc.active, doc.isActive, doc.status == null ? undefined : doc.status === 'active'].filter(v => v !== undefined);

  return {
    _id: String(doc._id),
    name: doc.name ?? doc.title ?? '',
    title: doc.title ?? '',
    subtitle: doc.subtitle ?? doc.description ?? '',
    image: doc.image ?? doc.imageUrl ?? doc.img ?? null,
    link: doc.link ?? doc.url ?? '',
    bgColor: doc.bgColor ?? '#1c1917',
    textColor: doc.textColor ?? '#ffffff',
    position: doc.position ?? null,
    order: Number.isFinite(doc.order) ? doc.order : Number.isFinite(doc.sortOrder) ? doc.sortOrder : 9999,
    active: !!active,
    startDate,
    endDate,
    state,
    contractIssues: [!POSITIONS.includes(doc.position) ? 'unsupported_position' : null,
      doc.isDemo === true ? 'demo_read_only' : null,
      !safeUrl(doc.link ?? doc.url ?? '') ? 'invalid_link' : null,
      !safeUrl(doc.image ?? doc.imageUrl ?? doc.img ?? '', true) ? 'invalid_image' : null,
      activeValues.some(v => typeof v !== 'boolean') || new Set(activeValues).size > 1 ? 'active_alias_conflict' : null,
      doc.order != null && doc.sortOrder != null && doc.order !== doc.sortOrder ? 'order_alias_conflict' : null,
      ...['order', 'sortOrder'].filter(key => doc[key] != null && (!Number.isSafeInteger(doc[key]) || doc[key] < 0)).map(key => key + '_invalid'),
      ...invalidDates.map(key => key + '_invalid'),
      startDate && endDate && endDate < startDate ? 'invalid_schedule' : null,
      ...[['startDate', 'startAt'], ['endDate', 'endAt']].filter(([a, b]) => doc[a] != null && doc[b] != null && +new Date(doc[a]) !== +new Date(doc[b])).map(([a]) => a + '_alias_conflict')].filter(Boolean),
    sourceSchedule: Object.fromEntries(['startDate', 'startAt', 'endDate', 'endAt'].filter(key => Object.hasOwn(doc, key)).map(key => [key, doc[key]])),
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

function parseBanner(body, existing = null) {
  const errors = {};
  const name = cleanText(body.name);
  const title = cleanText(body.title);
  const image = cleanText(body.image);
  const link = cleanText(body.link);
  const position = cleanText(body.position);
  const bgColor = cleanText(body.bgColor) || '#1c1917';
  const textColor = cleanText(body.textColor) || '#ffffff';
  let startDate = parseDay(body.startDate);
  let endDate = parseDay(body.endDate, true);
  // A date-only form must not round an existing timestamp when its day did not change.
  for (const [canonical, alias] of [['startDate', 'startAt'], ['endDate', 'endAt']]) {
    const stored = existing?.[canonical] ?? existing?.[alias];
    if (stored != null && dayOf(stored) === body[canonical]) {
      if (canonical === 'startDate') startDate = stored;
      else endDate = stored;
    }
  }

  if (!name) errors.name = 'Vui lòng đặt tên banner';
  if (body.active !== undefined && typeof body.active !== 'boolean') errors.active = 'Trạng thái phải là boolean';
  if (!title && !image) errors.title = 'Cần có tiêu đề hoặc ảnh banner';
  if (!safeUrl(image, true)) errors.image = 'URL ảnh không hợp lệ; dùng http(s), / hoặc images/ và không chứa thông tin đăng nhập';
  if (!safeUrl(link)) errors.link = 'URL điều hướng không hợp lệ; dùng đường dẫn / hoặc http(s), không dùng // hoặc thông tin đăng nhập';
  for (const [key, limit] of [['name', 120], ['title', 240], ['subtitle', 500]])
    if (cleanText(body[key]).length > limit || /[\u0000-\u001f\u007f]/.test(cleanText(body[key]))) errors[key] = `Tối đa ${limit} ký tự, không chứa ký tự điều khiển`;
  if (!POSITIONS.includes(position)) errors.position = 'Vị trí không hợp lệ';
  if (!/^#[0-9a-f]{6}$/i.test(bgColor)) errors.bgColor = 'Màu nền không hợp lệ';
  if (!/^#[0-9a-f]{6}$/i.test(textColor)) errors.textColor = 'Màu chữ không hợp lệ';
  if (startDate === undefined) errors.startDate = 'Ngày bắt đầu không hợp lệ';
  if (endDate === undefined) errors.endDate = 'Ngày kết thúc không hợp lệ';
  if (startDate && endDate && +new Date(endDate) < +new Date(startDate)) errors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu';

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
  if (error.status) return res.status(error.status).json({ message: error.message });
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
    list.sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.order - b.order || a._id.localeCompare(b._id));

  // ---------- Web khách ----------
  router.get('/banners', async (req, res) => {
    try {
      const now = new Date();
      const list = (await banners().find({}).toArray())
        .map((doc) => present(doc, now))
        .filter((b) => b.state === 'live' && !b.contractIssues.some(issue => ['invalid_link', 'invalid_image', 'demo_read_only', 'active_alias_conflict'].includes(issue)) && (!req.query.position || b.position === req.query.position));
      res.json(
        sortByOrder(list).map(({ _id, title, subtitle, image, link, bgColor, textColor, position }) => ({
          _id, title, subtitle, image, link, bgColor, textColor, position,
        })),
      );
    } catch (error) {
      handleError(res, error, 'GET /api/banners');
    }
  });

  // No alias/position normalization until the shared contract is approved.
  router.use('/admin/banners/:id', async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    try {
      const ids = req.params.id.toLowerCase() === 'reorder' ? req.body?.ids : [req.params.id];
      if (!Array.isArray(ids) || !ids.every(id => ObjectId.isValid(String(id)))) return res.status(400).json({ message: 'Invalid IDs' });
      const docs = await banners().find({ _id: { $in: ids.map(id => new ObjectId(String(id))) } }).toArray();
      const blocked = docs.map(doc => present(doc)).filter(doc => doc.contractIssues.length);
      if (blocked.length) return res.status(409).json({
        message: blocked.map(doc => `Banner ${doc._id} (${doc.name}): ${doc.contractIssues.join(', ')}. Chỉ đọc; cần xác minh dữ liệu.`).join(' '),
        records: blocked.map(doc => ({ id: doc._id, fields: doc.contractIssues, sourceSchedule: doc.sourceSchedule })),
      });
      next();
    } catch { return res.status(503).json({ message: 'Cannot verify banner contract' }); }
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
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 ||
          !ids.every((id) => typeof id === 'string' && ObjectId.isValid(id)) || new Set(ids).size !== ids.length)
        return res.status(400).json({ message: 'Cần gửi 1–500 ID banner khác nhau và hợp lệ.' });
      const supplied = req.body?.revisions;
      if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw revisions.conflict();
      await transaction(getDb(), async (session) => {
        const docs = await banners().find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { session }).toArray();
        if (docs.length !== ids.length || new Set(docs.map((doc) => doc.position)).size !== 1 || docs.some((doc) => present(doc).contractIssues.length))
          throw Object.assign(new Error('Chỉ sắp xếp các banner còn tồn tại trong cùng một vị trí hợp lệ.'), { status: 409 });
        const group = await banners().find({ position: docs[0].position }, { session }).toArray();
        if (group.length !== ids.length || group.some(doc => present(doc).contractIssues.length))
          throw Object.assign(new Error('Danh sách vị trí đã thay đổi hoặc có bản ghi cần đối soát. Tải lại toàn bộ nhóm trước khi sắp xếp.'), { status: 409 });
        const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
        for (const id of ids) revisions.requireRevision({ revision: supplied[id] }, byId.get(id));
        for (const [index, id] of ids.entries()) {
          const doc = byId.get(id);
          const result = await banners().updateOne({ _id: doc._id, position: doc.position, ...revisions.snapshot(doc) },
            { $set: { ...orderFields(doc, index + 1), updatedAt: revisions.nextUpdatedAt(doc) } }, { session });
          if (!result.matchedCount) throw revisions.conflict();
        }
      });
      res.json({ reordered: ids.length });
    } catch (error) {
      handleError(res, error, 'PATCH /api/admin/banners/reorder');
    }
  });

  // ---------- Admin: thêm ----------
  router.post('/admin/banners', async (req, res) => {
    try {
      const data = parseBanner(req.body || {});
      const group = await banners().find({ position: data.position }).toArray();
      const _id = new ObjectId();
      const { active, startDate, endDate, ...fields } = data;
      const doc = { _id, code: 'BN-' + String(_id).toUpperCase(), ...fields, status: active ? 'active' : 'inactive',
        ...(startDate ? { startAt: startDate } : {}), ...(endDate ? { endAt: endDate } : {}),
        sortOrder: Math.max(0, ...group.map(doc => present(doc).order)) + 1, createdAt: new Date(), updatedAt: new Date() };
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

      revisions.requireRevision(req.body, existing);

      const data = parseBanner(req.body || {}, existing);
      const update = { ...data, updatedAt: revisions.nextUpdatedAt(existing) };
      delete update.active;
      Object.assign(update, activeFields(existing, data.active));
      const unset = {};
      // Preserve the date keys already used by this document; never create a
      // competing canonical field beside an existing legacy alias.
      for (const [canonical, alias] of [['startDate', 'startAt'], ['endDate', 'endAt']]) {
        if (data[canonical] == null) {
          delete update[canonical];
          for (const key of [canonical, alias]) if (Object.hasOwn(existing, key)) unset[key] = '';
        } else if (Object.hasOwn(existing, alias)) {
          update[alias] = data[canonical];
          if (!Object.hasOwn(existing, canonical)) delete update[canonical];
        } else if (!Object.hasOwn(existing, canonical)) {
          update[alias] = data[canonical];
          delete update[canonical];
        }
      }
      // Đổi sang vị trí khác thì xếp xuống cuối vị trí mới
      if (data.position !== existing.position) {
        const group = await banners().find({ position: data.position }).toArray();
        Object.assign(update, orderFields(existing, Math.max(0, ...group.map(doc => present(doc).order)) + 1));
      }
      const result = await banners().updateOne({ _id, ...revisions.snapshot(existing) },
        { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
      if (!result.matchedCount) throw revisions.conflict();
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
      const existing = await banners().findOne({ _id });
      if (!existing) return res.status(404).json({ message: 'Không tìm thấy banner' });
      revisions.requireRevision(req.body, existing);
      const result = await banners().updateOne({ _id, ...revisions.snapshot(existing) }, { $set: { ...activeFields(existing, req.body.active), updatedAt: revisions.nextUpdatedAt(existing) } });
      if (!result.matchedCount) throw revisions.conflict();
      res.json(present(await banners().findOne({ _id })));
    } catch (error) {
      handleError(res, error, 'PATCH /api/admin/banners/:id');
    }
  });

  // ---------- Admin: xoá ----------
  router.delete('/admin/banners/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy banner' });
      const _id = new ObjectId(req.params.id);
      const existing = await banners().findOne({ _id });
      if (!existing) return res.status(404).json({ message: 'Không tìm thấy banner' });
      revisions.requireRevision(req.body, existing);
      const result = await banners().deleteOne({ _id, ...revisions.snapshot(existing) });
      if (!result.deletedCount) throw revisions.conflict();
      res.json({ deleted: true });
    } catch (error) {
      handleError(res, error, 'DELETE /api/admin/banners/:id');
    }
  });

  return router;
};
module.exports.present = present;
