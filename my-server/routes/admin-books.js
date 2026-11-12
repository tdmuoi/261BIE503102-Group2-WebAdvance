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
const { ObjectId, GridFSBucket } = require('mongodb');
const revisions = require('../middleware/admin-revision');
const transaction = require('../middleware/admin-transaction');
const { adjustStock } = require('../middleware/admin-safe-status');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const PDF_MAX_BYTES = 10 * 1024 * 1024;
function validPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 40 || buffer.length > PDF_MAX_BYTES ||
      !/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\n|\r)/.test(buffer.subarray(0, 16).toString('latin1'))) return false;
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1');
  const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if (!end) return false;
  const pdf = buffer.toString('latin1'), visited = new Set(), objects = new Map();
  let offset = Number(end[1]), root;
  // Follow the referenced trailers, not the last 2 KiB. Linearized files point
  // to a first-page xref near the header; its /Prev points toward the file end.
  while (offset !== null) {
    if (!Number.isSafeInteger(offset) || offset < 8 || offset >= buffer.length || visited.has(offset) || visited.size >= 64) return false;
    visited.add(offset);
    let dictionary;
    if (pdf.startsWith('xref', offset)) {
      let cursor = offset + 4;
      for (;;) {
        const trailer = /^\s*trailer\s*<<([\s\S]*?)>>/.exec(pdf.slice(cursor));
        if (trailer) { dictionary = trailer[1]; break; }
        const section = /^\s*(\d+)\s+(\d+)[ \t]*(?:\r\n|\n|\r)/.exec(pdf.slice(cursor));
        if (!section) return false;
        const first = Number(section[1]), count = Number(section[2]);
        if (!Number.isSafeInteger(first + count) || count > buffer.length / 18) return false;
        cursor += section[0].length;
        for (let i = 0; i < count; i++) {
          const entry = /^(\d{10})[ \t]+(\d{5})[ \t]+([nf])[ \t]*(?:\r\n|\n|\r)/.exec(pdf.slice(cursor));
          if (!entry) return false;
          const position = Number(entry[1]), generation = Number(entry[2]), key = (first + i) + ':' + generation;
          if (generation > 65535) return false;
          // Some producers retain zero-offset placeholders for unused objects.
          // They are never accepted as the document's Root object.
          if (entry[3] === 'n' && position !== 0 && (position < 8 || position >= buffer.length ||
              !new RegExp('^' + (first + i) + '\\s+' + generation + '\\s+obj\\b').test(pdf.slice(position, position + 64)))) return false;
          if (!objects.has(key)) objects.set(key, entry[3] === 'n' && position !== 0 ? position : null);
          cursor += entry[0].length;
        }
      }
    } else {
      // Preserve PDF 1.5+ cross-reference stream support, including compressed
      // catalog objects; this is a format check, not a renderer or content scan.
      const stream = /^\d+\s+\d+\s+obj\b\s*<<([\s\S]*?)>>\s*stream(?:\r\n|\n|\r)/.exec(pdf.slice(offset));
      const reference = stream && /\/Root\s+([1-9]\d*)\s+(\d+)\s+R\b/.exec(stream[1]);
      const size = stream && /\/Size\s+([1-9]\d*)\b/.exec(stream[1]);
      const catalogPattern = reference && new RegExp('(?:^|[\\r\\n])' + reference[1] + '\\s+' + reference[2] + '\\s+obj\\b\\s*<<(?:(?!endobj)[\\s\\S])*?\\/Type\\s*\\/Catalog\\b');
      return !!stream && !!reference && !!size && Number(reference[1]) < Number(size[1]) && /\/Type\s*\/XRef\b/.test(stream[1]) &&
        /\/W\s*\[\s*\d+\s+\d+\s+\d+\s*\]/.test(stream[1]) &&
        (catalogPattern.test(pdf) || /\d+\s+\d+\s+obj\b\s*<<[^>]*\/Type\s*\/ObjStm\b[^>]*>>\s*stream/.test(pdf)) &&
        /endstream\s*endobj\b/.test(pdf.slice(offset + stream[0].length));
    }
    const reference = /\/Root\s+([1-9]\d*)\s+(\d+)\s+R\b/.exec(dictionary);
    if (reference && !root) root = reference[1] + ':' + reference[2];
    const previous = /\/Prev\s+(\d+)\b/.exec(dictionary);
    offset = previous ? Number(previous[1]) : null;
  }
  const catalog = root && objects.get(root);
  return Number.isSafeInteger(catalog) &&
    /^\d+\s+\d+\s+obj\b\s*<<(?:(?!endobj)[\s\S])*?\/Type\s*\/Catalog\b/.test(pdf.slice(catalog));
}
async function streamPdf(db, book, req, res) {
  if (!(book?.ebookFileId instanceof ObjectId)) return res.status(404).json({ message: 'Ebook chưa có PDF được xác minh.' });
  const file = await db.collection('fs.files').findOne({ _id: book.ebookFileId, 'metadata.bookId': book._id, 'metadata.verified': true });
  if (!file || !Number.isSafeInteger(file.length) || file.length < 1 || file.length > PDF_MAX_BYTES)
    return res.status(404).json({ message: 'Không tìm thấy PDF hợp lệ.' });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Length': String(file.length), 'Content-Disposition': 'inline; filename="ebook.pdf"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox" });
  const download = new GridFSBucket(db).openDownloadStream(file._id);
  download.on('error', () => { if (res.headersSent) res.destroy(); else {
    for (const header of ['Content-Length', 'Content-Type', 'Content-Disposition']) res.removeHeader(header);
    res.status(503).json({ message: 'Không đọc được PDF. Vui lòng thử lại.' });
  } });
  res.on('close', () => download.destroy());
  download.pipe(res);
}

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
  async function parseBook(body, style, existing = null) {
    const errors = {};
    const title = cleanText(body.title);
    const price = toNumber(body.price, NaN);
    const originalPrice = toNumber(body.originalPrice, price);
    const stock = toNumber(body.stock, 0);
    const bookType = body.bookType ?? existing?.bookType;
    const condition = bookType === 'used' ? cleanText(body.condition ?? existing?.condition) : null;
    if (!['new', 'used', 'ebook'].includes(bookType)) errors.bookType = 'Invalid bookType';
    if (bookType === 'used' && !condition) errors.condition = 'Used condition required';
    if (existing && existing.bookType !== bookType) errors.bookType = 'Type conversion needs an approved inventory policy';
    if (bookType === 'ebook' && stock !== 0) errors.stock = 'Ebooks have no physical stock';
    const status = EDITABLE_STATUSES.includes(body.status) ? body.status : 'active';

    if (!title) errors.title = 'Vui lòng nhập tên sách';
    if (!Number.isFinite(price) || price < 0) errors.price = 'Giá bán phải là số ≥ 0';
    if (!Number.isFinite(originalPrice) || originalPrice < 0) errors.originalPrice = 'Giá gốc phải là số ≥ 0';
    else if (Number.isFinite(price) && originalPrice < price) errors.originalPrice = 'Giá gốc không được nhỏ hơn giá bán';
    if (!Number.isSafeInteger(stock) || stock < 0) errors.stock = 'Tồn kho phải là số nguyên an toàn ≥ 0';

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
      bookType,
      condition,
      stock,
      status,
    };
  }

  function handleError(res, error, action) {
    if ([400, 401, 403, 413, 415].includes(error.status)) return res.status(error.status).json({ message: error.message });
    if ([409, 503].includes(error.status)) return res.status(error.status).json({ message: error.message });
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: 'Dữ liệu chưa hợp lệ', errors: error.errors });
    }
    console.error(`${action} failed:`, error.message);
    return res.status(500).json({ message: 'Lỗi server, vui lòng thử lại' });
  }

  // ---------- GET danh sách ----------
  router.get(['/books', '/books/inventory'], async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
      const inventory = req.path.toLowerCase().replace(/\/+$/, '') === '/books/inventory';
      const base = { status: { $ne: 'deleted' }, ...(inventory ? { isDemo: { $ne: true } } : {}) };
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
        low: { bookType: { $in: ['new', 'used'] }, stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } },
        out: { bookType: { $in: ['new', 'used'] }, stock: { $lte: 0 } },
      };
      const statusFilter = statusFilters[req.query.status] || {};
      const listFilter = { ...filter, ...statusFilter };

      const [items, total, all, active, hidden, low, out] = await Promise.all([
        books().find(listFilter).sort({ ...(SORTS[req.query.sort] || SORTS.newest), ...(inventory ? { _id: 1 } : {}) }).skip((page - 1) * limit).limit(limit).toArray(),
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
        capabilities: { bookClassification: true },
      });
    } catch (error) {
      handleError(res, error, 'GET /api/admin/books');
    }
  });

  router.get('/books/:id/pdf', async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy sách.' });
      const book = await books().findOne({ _id: new ObjectId(req.params.id), bookType: 'ebook', isDemo: { $ne: true } });
      if (!book) return res.status(404).json({ message: 'Không tìm thấy Ebook.' });
      await streamPdf(getDb(), book, req, res);
    } catch (error) { handleError(res, error, 'GET ebook PDF'); }
  });
  router.post('/books/:id/pdf', async (req, res, next) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy sách.' });
      const book = await books().findOne({ _id: new ObjectId(req.params.id), bookType: 'ebook', status: { $ne: 'deleted' }, isDemo: { $ne: true } });
      if (!book) return res.status(409).json({ message: 'Chỉ upload PDF cho Ebook còn quản lý, không phải dữ liệu demo.' });
      if (!req.is('application/pdf')) return res.status(415).json({ message: 'Chỉ nhận nội dung application/pdf.' });
      revisions.requireRevision({ revision: req.query.revision || null }, book);
      // Provision GridFS indexes separately; do not let an upload silently
      // create production indexes or collections on the first request.
      const [filesIndexes, chunksIndexes] = await Promise.all(['fs.files', 'fs.chunks'].map(name => getDb().collection(name).listIndexes().toArray()));
      if (!filesIndexes.some(index => JSON.stringify(index.key) === JSON.stringify({ filename: 1, uploadDate: 1 })) ||
          !chunksIndexes.some(index => index.unique === true && JSON.stringify(index.key) === JSON.stringify({ files_id: 1, n: 1 })))
        return res.status(503).json({ message: 'GridFS chưa có index chuẩn. Cần quản trị Database chuẩn bị trước khi upload.' });
      req.pdfBook = book; next();
    } catch (error) {
      if (error.code === 26) return res.status(503).json({ message: 'GridFS chưa được chuẩn bị. Cần tạo collection/index chuẩn trước khi upload.' });
      handleError(res, error, 'Validate PDF upload');
    }
  }, express.raw({ type: 'application/pdf', limit: PDF_MAX_BYTES }), async (req, res) => {
    const book = req.pdfBook, db = getDb(), fileId = new ObjectId(), bucket = new GridFSBucket(db, { writeConcern: { w: 'majority' } });
    let upload, linkAttempted = false, linkTimestamp, sha256, verifiedUpload = false;
    try {
      if (!validPdf(req.body)) return res.status(400).json({ message: 'PDF không hợp lệ hoặc thiếu cấu trúc startxref/EOF.' });
      sha256 = createHash('sha256').update(req.body).digest('hex');
      upload = bucket.openUploadStreamWithId(fileId, `ebook-${book._id}.pdf`, { metadata: {
        bookId: book._id, uploadedBy: new ObjectId(req.admin._id), contentType: 'application/pdf', sha256, verified: false,
      } });
      await pipeline(Readable.from([req.body]), upload);
      const file = await db.collection('fs.files').findOne({ _id: fileId });
      const verifyHash = createHash('sha256'); let size = 0;
      for await (const chunk of bucket.openDownloadStream(fileId)) { verifyHash.update(chunk); size += chunk.length; }
      if (!file || file.length !== req.body.length || size !== req.body.length || verifyHash.digest('hex') !== sha256)
        throw new Error('PDF read-back verification failed');
      const verified = await db.collection('fs.files').updateOne({ _id: fileId, 'metadata.bookId': book._id }, { $set: { 'metadata.verified': true } }, { writeConcern: { w: 'majority' } });
      if (verified.matchedCount !== 1) throw new Error('PDF verification metadata missing');
      verifiedUpload = true;
      linkTimestamp = revisions.nextUpdatedAt(book); linkAttempted = true;
      const updated = await books().updateOne({ _id: book._id, bookType: 'ebook', status: { $ne: 'deleted' }, isDemo: { $ne: true }, ...revisions.snapshot(book) },
        { $set: { ebookFileId: fileId, updatedAt: linkTimestamp } }, { writeConcern: { w: 'majority' } });
      if (!updated.matchedCount) throw revisions.conflict();
      res.status(201).json({ fileId: String(fileId), size, sha256, revision: linkTimestamp.toISOString() });
    } catch (error) {
      try {
        // Fence an ambiguous update before deleting its file: a late update using
        // the old revision can no longer link a file that cleanup is removing.
        if (linkAttempted) await books().updateOne({ _id: book._id, bookType: 'ebook', isDemo: { $ne: true }, ...revisions.snapshot(book) },
          { $set: { updatedAt: new Date(Math.max(Date.now(), +linkTimestamp + 1)) } }, { writeConcern: { w: 'majority' } });
        const linked = await books().findOne({ ebookFileId: fileId });
        if (linked && verifiedUpload) return res.status(200).json({ fileId: String(fileId), size: req.body.length, sha256, revision: revisions.revision(linked) });
        if (!linked) {
          if (upload && !upload.writableFinished && !upload.aborted) await upload.abort().catch(() => {});
          await db.collection('fs.chunks').deleteMany({ files_id: fileId });
          await db.collection('fs.files').deleteOne({ _id: fileId, 'metadata.bookId': book._id });
        }
      } catch (cleanupError) { console.error('PDF cleanup deferred; preserve possible linked file:', String(fileId), cleanupError.message); }
      handleError(res, error, 'Upload ebook PDF');
    }
  }, (error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: 'PDF quá lớn (tối đa 10 MiB) hoặc upload chưa hoàn tất.' });
  });

  const receiptView = doc => ({ id: String(doc._id), operationCode: doc.operationCode, bookId: String(doc.bookId),
    bookTitle: doc.bookTitle, quantity: doc.quantityChange, stockBefore: doc.stockBefore, stockAfter: doc.stockAfter,
    actorName: doc.actorName, createdAt: doc.createdAt.toISOString(), note: doc.note, revision: doc.bookRevision });
  router.get('/books/inventory/history', async (req, res) => {
    try {
      if (req.query.bookId && !ObjectId.isValid(req.query.bookId)) return res.status(400).json({ message: 'ID sách không hợp lệ.' });
      const items = await getDb().collection('inventory_logs').find({ reason: 'stock_in', isDemo: { $ne: true },
        ...(req.query.bookId ? { bookId: new ObjectId(req.query.bookId) } : {}) }).sort({ createdAt: -1, _id: -1 }).limit(30).toArray();
      res.json({ items: items.map(receiptView) });
    } catch (error) { handleError(res, error, 'GET inventory history'); }
  });
  router.post('/books/inventory/stock-in', async (req, res) => {
    try {
      const body = req.body || {}, key = req.get('Idempotency-Key'), actor = req.admin?._id;
      const fail = (status, message) => Object.assign(new Error(message), { status });
      if (!actor || !ObjectId.isValid(actor)) throw fail(401, 'Cần phiên quản trị hợp lệ.');
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw fail(400, 'Cần Idempotency-Key hợp lệ để nhập kho.');
      if (Object.keys(body).some(k => !['bookId', 'quantity', 'revision', 'note'].includes(k)) ||
          !ObjectId.isValid(body.bookId) || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000000 ||
          !Object.hasOwn(body, 'revision') || (body.note != null && (typeof body.note !== 'string' || body.note.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.note))))
        throw fail(400, 'Sách, số lượng nguyên dương (tối đa 1.000.000), revision hoặc ghi chú chưa hợp lệ.');
      const hash = value => createHash('sha256').update(value).digest('hex');
      const keyHash = hash('stock-in:' + actor + ':' + key), id = new ObjectId(keyHash.slice(0, 24));
      const requestHash = hash(JSON.stringify([String(body.bookId), body.quantity, body.revision, (body.note || '').trim()]));
      const logs = getDb().collection('inventory_logs');
      const replay = doc => {
        if (doc.isDemo === true || String(doc.actorId) !== actor || doc.idempotencyKeyHash !== keyHash || doc.requestHash !== requestHash)
          throw fail(409, 'Khóa nhập kho đã được dùng cho nội dung khác.');
        return doc;
      };
      let created = false, receipt;
      try {
        receipt = await transaction(getDb(), async session => {
          created = false;
          const existing = await logs.findOne({ _id: id }, { session });
          if (existing) return replay(existing);
          const book = await books().findOne({ _id: new ObjectId(body.bookId), isDemo: { $ne: true }, status: { $in: EDITABLE_STATUSES } }, { session });
          if (!book || !['new', 'used'].includes(book.bookType)) throw fail(409, 'Chỉ nhập kho sách vật lý còn quản lý; không nhập Ebook hoặc dữ liệu demo.');
          revisions.requireRevision(body, book);
          await adjustStock(getDb(), session, [{ bookId: book._id, quantity: body.quantity }], 1);
          const updated = await books().findOne({ _id: book._id }, { session });
          const doc = { _id: id, operationCode: 'IN-' + String(id).toUpperCase(), reason: 'stock_in',
            bookId: book._id, productId: book._id, productType: book.bookType, bookTitle: book.title,
            quantityChange: body.quantity, stockBefore: book.stock, stockAfter: updated.stock,
            actorId: new ObjectId(actor), actorName: req.admin.fullName || '', createdAt: new Date(), note: (body.note || '').trim(),
            bookRevision: revisions.revision(updated), idempotencyKeyHash: keyHash, requestHash };
          await logs.insertOne(doc, { session }); created = true; return doc;
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await logs.findOne({ _id: id });
        if (!existing) throw error;
        receipt = replay(existing); created = false;
      }
      res.status(created ? 201 : 200).json(receiptView(receipt));
    } catch (error) { handleError(res, error, 'POST inventory stock-in'); }
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
      const modified = await transaction(getDb(), async (session) => {
        const docs = await books().find({ _id: { $in: ids.map((id) => new ObjectId(String(id))) },
          status: { $ne: 'deleted' }, isDemo: { $ne: true } }, { session }).toArray();
        for (const doc of docs) {
          const timestamp = revisions.nextUpdatedAt(doc);
          const updatedAt = typeof doc.updatedAt === 'string' || typeof doc.createdAt === 'string' ? timestamp.toISOString() : timestamp;
          const result = await books().updateOne({ _id: doc._id, ...revisions.snapshot(doc), stock: doc.stock, isDemo: { $ne: true } },
            { $set: { status, updatedAt, ...(status === 'deleted' ? { deletedAt: updatedAt } : {}) } }, { session });
          if (!result.matchedCount) throw revisions.conflict();
        }
        return docs.length;
      });
      res.json({ modified });
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
      let result;
      if (data.bookType === 'used') {
        const existingCollections = await getDb().listCollections({}, { nameOnly: true }).toArray();
        if (!existingCollections.some((collection) => collection.name === 'old_books'))
          throw Object.assign(new Error('Chưa có collection old_books; chưa tạo sách cũ.'), { status: 503 });
        doc._id = new ObjectId();
        result = await transaction(getDb(), async (session) => {
          await getDb().collection('old_books').insertOne(doc, { session });
          return books().insertOne(doc, { session });
        });
      } else result = await books().insertOne(doc);
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

      revisions.requireRevision(req.body, existing);

      const style = await storageStyle();
      const data = await parseBook(req.body || {}, style, existing);
      const timestamp = revisions.nextUpdatedAt(existing);
      const changesStock = data.stock !== existing.stock && ['new', 'used'].includes(existing.bookType);
      const update = async (session) => {
        let snapshot = existing;
        if (changesStock) {
          const current = await books().findOne({ _id }, { session });
          if (!current || current.stock !== existing.stock) throw revisions.conflict();
          revisions.requireRevision(req.body, current);
          await adjustStock(getDb(), session, [{ bookId: _id, quantity: Math.abs(data.stock - existing.stock) }],
            data.stock > existing.stock ? 1 : -1);
          snapshot = await books().findOne({ _id }, { session });
        }
        return books().updateOne(
          { _id, status: existing.status,
            stock: changesStock ? data.stock : Object.hasOwn(existing, 'stock') ? existing.stock : { $exists: false },
            ...revisions.snapshot(snapshot) },
          { $set: { ...data, updatedAt: changesStock ? snapshot.updatedAt : style.dateAsString ? timestamp.toISOString() : timestamp } }, { session });
      };
      const result = changesStock
        ? await transaction(getDb(), async (session) => {
          const updated = await update(session);
          if (!updated.matchedCount) throw revisions.conflict();
          return updated;
        }) : await update();
      if (!result.matchedCount) throw revisions.conflict();
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
      const existing = await books().findOne({ _id: new ObjectId(req.params.id), status: { $ne: 'deleted' }, isDemo: { $ne: true } });
      if (!existing) return res.status(404).json({ message: 'Không tìm thấy sách' });
      const timestamp = revisions.nextUpdatedAt(existing);
      const updatedAt = typeof existing.updatedAt === 'string' || typeof existing.createdAt === 'string' ? timestamp.toISOString() : timestamp;
      const result = await books().updateOne(
        { _id: existing._id, status: existing.status, stock: existing.stock, ...revisions.snapshot(existing) },
        { $set: { status: 'deleted', deletedAt: updatedAt, updatedAt } },
      );
      if (!result.matchedCount) throw revisions.conflict();
      res.json({ deleted: true });
    } catch (error) {
      handleError(res, error, 'DELETE /api/admin/books/:id');
    }
  });

  return router;
};
module.exports.validPdf = validPdf;
module.exports.streamPdf = streamPdf;
module.exports.PDF_MAX_BYTES = PDF_MAX_BYTES;
