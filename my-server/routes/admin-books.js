// =====================================================================
// API Quản lý sách cho my-admin  (gắn vào index.js: app.use('/api/admin', adminBooksRoutes(() => database)))
//
//   GET    /api/admin/books              danh sách + lọc + phân trang
//            ?q=          tìm theo tên sách, ISBN hoặc tên tác giả
//            ?status=     active | hidden | low | out      (low = sắp hết, out = hết hàng)
//            ?categoryId= lọc theo thể loại
//            ?sort=       newest | updated | title | price_asc | price_desc | stock_asc
//            ?page=1&limit=10
//   GET    /api/admin/books/:id          chi tiết 1 sách (để sửa)
//   POST   /api/admin/books              thêm sách
//   PUT    /api/admin/books/:id          sửa sách
//   PATCH  /api/admin/books/bulk         { ids: [...], action: 'hide' | 'show' | 'delete' }
//   DELETE /api/admin/books/:id          xoá (xoá mềm: status = 'deleted', web khách không thấy nữa,
//                                        đơn hàng cũ vẫn tra được sách)
//
// Web khách (GET /api/books) chỉ lấy status = 'active' nên sách "hidden"/"deleted" tự biến mất.
// =====================================================================
const express = require('express');
const { ObjectId } = require('mongodb');

const LOW_STOCK_THRESHOLD = 5;
const EDITABLE_STATUSES = ['active', 'hidden'];
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  updated: { updatedAt: -1, _id: -1 },
  title: { title: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  stock_asc: { stock: 1 },
};

// ---------- Hàm phụ ----------
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Id trong DB có thể lưu dạng ObjectId hoặc chuỗi -> khớp cả hai */
function matchId(id) {
  const values = [String(id)];
  if (ObjectId.isValid(id)) values.push(new ObjectId(String(id)));
  return { $in: values };
}


function toNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

class ValidationError extends Error {
  constructor(errors) {
    super('Invalid book data');
    this.errors = errors;
  }
}

module.exports = function adminBooksRoutes(getDb) {
  const router = express.Router();
  const books = () => getDb().collection('books');
  const authors = () => getDb().collection('authors');
  const categories = () => getDb().collection('categories');

  /**
   * Dữ liệu cũ lưu authorId/categoryId/createdAt theo kiểu nào thì sách mới lưu theo đúng kiểu đó,
   * để các API khác (web khách, dashboard) đọc giống nhau.
   */
  async function storageStyle() {
    const sample = await books().findOne({ categoryId: { $nin: [null, ''] } });
    return {
      idAsObjectId: sample ? sample.categoryId instanceof ObjectId : true,
      dateAsString: sample ? typeof sample.createdAt === 'string' : false,
    };
  }

  function storeId(id, style) {
    if (!id) return null;
    return style.idAsObjectId && ObjectId.isValid(id) ? new ObjectId(String(id)) : String(id);
  }

  function now(style) {
    return style.dateAsString ? new Date().toISOString() : new Date();
  }

  /** Ghép tên tác giả + tên thể loại vào sách */
  async function withNames(list) {
    const authorIds = [...new Set(list.map((b) => b.authorId).filter(Boolean).map(String))];
    const categoryIds = [...new Set(list.map((b) => b.categoryId).filter(Boolean).map(String))];
    const [authorDocs, categoryDocs] = await Promise.all([
      authorIds.length ? authors().find({ _id: { $in: authorIds.flatMap((id) => matchId(id).$in) } }).project({ name: 1 }).toArray() : [],
      categoryIds.length ? categories().find({ _id: { $in: categoryIds.flatMap((id) => matchId(id).$in) } }).project({ name: 1 }).toArray() : [],
    ]);
    const authorName = new Map(authorDocs.map((a) => [String(a._id), a.name]));
    const categoryName = new Map(categoryDocs.map((c) => [String(c._id), c.name]));
    return list.map((b) => ({
      ...b,
      authorName: authorName.get(String(b.authorId)) || '',
      categoryName: categoryName.get(String(b.categoryId)) || '',
    }));
  }

  /** Kiểm tra + chuẩn hoá dữ liệu gửi lên từ form */
  async function parseBook(body, style) {
    const errors = {};
    const title = cleanText(body.title);
    const price = toNumber(body.price, NaN);
    const originalPrice = toNumber(body.originalPrice, price);
    const stock = toNumber(body.stock, 0);
    const status = EDITABLE_STATUSES.includes(body.status) ? body.status : 'active';

    if (!title) errors.title = 'Vui lòng nhập tên sách';
    if (!Number.isFinite(price) || price < 0) errors.price = 'Giá bán phải là số ≥ 0';
    if (!Number.isFinite(originalPrice) || originalPrice < 0) errors.originalPrice = 'Giá gốc phải là số ≥ 0';
    else if (Number.isFinite(price) && originalPrice < price) errors.originalPrice = 'Giá gốc không được nhỏ hơn giá bán';
    if (!Number.isInteger(stock) || stock < 0) errors.stock = 'Tồn kho phải là số nguyên ≥ 0';

    const publishYear = toNumber(body.publishYear, null);
    if (publishYear !== null && (!Number.isInteger(publishYear) || publishYear < 1000 || publishYear > 2100)) {
      errors.publishYear = 'Năm xuất bản không hợp lệ';
    }
    const pages = toNumber(body.pages, null);
    if (pages !== null && (!Number.isInteger(pages) || pages <= 0)) errors.pages = 'Số trang phải là số nguyên > 0';

    // Thể loại
    let categoryId = null;
    if (body.categoryId) {
      const found = await categories().findOne({ _id: matchId(body.categoryId) });
      if (!found) errors.categoryId = 'Thể loại không tồn tại';
      else categoryId = storeId(String(found._id), style);
    } else {
      errors.categoryId = 'Vui lòng chọn thể loại';
    }

    // Tác giả: chọn theo id, hoặc gõ tên -> tìm đúng tên, chưa có thì tạo tác giả mới
    let authorId = null;
    const authorName = cleanText(body.authorName);
    if (body.authorId) {
      const found = await authors().findOne({ _id: matchId(body.authorId) });
      if (!found) errors.authorId = 'Tác giả không tồn tại';
      else authorId = storeId(String(found._id), style);
    } else if (authorName && Object.keys(errors).length === 0) {
      const found = await authors().findOne({ name: { $regex: `^${escapeRegex(authorName)}$`, $options: 'i' } });
      if (found) {
        authorId = storeId(String(found._id), style);
      } else {
        const created = await authors().insertOne({
          name: authorName, desc: null, img: null, status: 'active', createdAt: now(style), updatedAt: now(style),
        });
        authorId = storeId(String(created.insertedId), style);
      }
    }

    if (Object.keys(errors).length) throw new ValidationError(errors);

    return {
      title,
      authorId,
      categoryId,
      image: cleanText(body.image) || null,
      isbn: cleanText(body.isbn) || null,
      publisher: cleanText(body.publisher) || null,
      publishYear,
      pages,
      description: cleanText(body.description) || null,
      price,
      originalPrice,
      discountPercent: originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0,
      stock,
      status,
    };
  }

  function handleError(res, error, action) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: 'Dữ liệu chưa hợp lệ', errors: error.errors });
    }
    console.error(`${action} failed:`, error.message);
    return res.status(500).json({ message: 'Lỗi server, vui lòng thử lại' });
  }

  // ---------- GET danh sách ----------
  router.get('/books', async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
      const base = { status: { $ne: 'deleted' } };
      const filter = { ...base };

      const q = cleanText(req.query.q);
      if (q) {
        const regex = { $regex: escapeRegex(q), $options: 'i' };
        const matchedAuthors = await authors().find({ name: regex }).project({ _id: 1 }).limit(50).toArray();
        filter.$or = [
          { title: regex },
          { isbn: regex },
          ...(matchedAuthors.length ? [{ authorId: { $in: matchedAuthors.flatMap((a) => matchId(a._id).$in) } }] : []),
        ];
      }
      if (req.query.categoryId) filter.categoryId = matchId(req.query.categoryId);

      const statusFilters = {
        active: { status: 'active' },
        hidden: { status: 'hidden' },
        low: { stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } },
        out: { stock: { $lte: 0 } },
      };
      const statusFilter = statusFilters[req.query.status] || {};
      const listFilter = { ...filter, ...statusFilter };

      const [items, total, all, active, hidden, low, out] = await Promise.all([
        books().find(listFilter).sort(SORTS[req.query.sort] || SORTS.newest).skip((page - 1) * limit).limit(limit).toArray(),
        books().countDocuments(listFilter),
        // Số đếm cho các tab lọc (theo ô tìm kiếm + thể loại hiện tại)
        books().countDocuments(filter),
        books().countDocuments({ ...filter, ...statusFilters.active }),
        books().countDocuments({ ...filter, ...statusFilters.hidden }),
        books().countDocuments({ ...filter, ...statusFilters.low }),
        books().countDocuments({ ...filter, ...statusFilters.out }),
      ]);

      res.json({
        items: await withNames(items),
        total,
        page,
        limit,
        counts: { all, active, hidden, low, out },
        lowStockThreshold: LOW_STOCK_THRESHOLD,
      });
    } catch (error) {
      handleError(res, error, 'GET /api/admin/books');
    }
  });

  // ---------- PATCH thao tác hàng loạt (đặt trước /books/:id) ----------
  router.patch('/books/bulk', async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => ObjectId.isValid(id)) : [];
      const statusByAction = { hide: 'hidden', show: 'active', delete: 'deleted' };
      const status = statusByAction[req.body?.action];
      if (!ids.length || !status) {
        return res.status(400).json({ message: 'Cần gửi ids và action (hide | show | delete)' });
      }
      const style = await storageStyle();
      const update = { status, updatedAt: now(style) };
      if (status === 'deleted') update.deletedAt = now(style);
      const result = await books().updateMany(
        { _id: { $in: ids.map((id) => new ObjectId(String(id))) }, status: { $ne: 'deleted' } },
        { $set: update },
      );
      res.json({ modified: result.modifiedCount });
    } catch (error) {
      handleError(res, error, 'PATCH /api/admin/books/bulk');
    }
  });

  // ---------- GET 1 sách ----------
  router.get('/books/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy sách' });
      const book = await books().findOne({ _id: new ObjectId(req.params.id), status: { $ne: 'deleted' } });
      if (!book) return res.status(404).json({ message: 'Không tìm thấy sách' });
      res.json((await withNames([book]))[0]);
    } catch (error) {
      handleError(res, error, 'GET /api/admin/books/:id');
    }
  });

  // ---------- POST thêm sách ----------
  router.post('/books', async (req, res) => {
    try {
      const style = await storageStyle();
      const data = await parseBook(req.body || {}, style);
      const doc = { ...data, createdAt: now(style), updatedAt: now(style) };
      const result = await books().insertOne(doc);
      res.status(201).json((await withNames([{ _id: result.insertedId, ...doc }]))[0]);
    } catch (error) {
      handleError(res, error, 'POST /api/admin/books');
    }
  });

  // ---------- PUT sửa sách ----------
  router.put('/books/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy sách' });
      const _id = new ObjectId(req.params.id);
      const existing = await books().findOne({ _id, status: { $ne: 'deleted' } });
      if (!existing) return res.status(404).json({ message: 'Không tìm thấy sách' });

      const style = await storageStyle();
      const data = await parseBook(req.body || {}, style);
      await books().updateOne({ _id }, { $set: { ...data, updatedAt: now(style) } });
      const updated = await books().findOne({ _id });
      res.json((await withNames([updated]))[0]);
    } catch (error) {
      handleError(res, error, 'PUT /api/admin/books/:id');
    }
  });

  // ---------- DELETE xoá mềm ----------
  router.delete('/books/:id', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy sách' });
      const style = await storageStyle();
      const result = await books().updateOne(
        { _id: new ObjectId(req.params.id), status: { $ne: 'deleted' } },
        { $set: { status: 'deleted', deletedAt: now(style), updatedAt: now(style) } },
      );
      if (!result.matchedCount) return res.status(404).json({ message: 'Không tìm thấy sách' });
      res.json({ deleted: true });
    } catch (error) {
      handleError(res, error, 'DELETE /api/admin/books/:id');
    }
  });

  return router;
};
