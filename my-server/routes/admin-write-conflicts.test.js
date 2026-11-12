const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ObjectId } = require('mongodb');
const revisions = require('../middleware/admin-revision');

test('Public catalog and librarian redact paid Ebook sources while preserving product data and free books', async (t) => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const { createRequire } = require('node:module');
  const paid = { _id: new ObjectId(), title: 'Paid Ebook', bookType: 'ebook', price: 253000, originalPrice: 550000,
    discountPercent: 54, stock: 0, status: 'active', authorId: new ObjectId(), categoryId: new ObjectId(),
    image: '/cover.jpg', description: 'Product description', language: 'en', pages: 106, createdAt: new Date('2026-11-12'),
    fileUrl: 'https://content.invalid/full.pdf', pdfUrl: 'https://content.invalid/full.pdf',
    previewUrl: 'https://content.invalid/full.pdf', htmlUrl: 'https://content.invalid/full.html',
    sourceUrl: 'https://content.invalid/download', pdfSourcePage: 'https://content.invalid/file-page',
    ebookFileId: new ObjectId(), ebookMetadata: { fileUrl: 'https://content.invalid/nested.pdf' } };
  const free = { ...paid, _id: new ObjectId(), title: 'Free Ebook', price: 0, originalPrice: 0, createdAt: new Date('2026-11-11') };
  const physical = { ...paid, _id: new ObjectId(), title: 'Printed book', bookType: 'new', stock: 2, createdAt: new Date('2026-11-10') };
  const records = {
    books: [paid, free, physical, { ...paid, _id: new ObjectId(), title: 'Hidden Ebook', status: 'hidden' }],
    authors: [{ _id: paid.authorId, name: 'Author' }], categories: [{ _id: paid.categoryId, name: 'Books', slug: 'ebook' }],
  };
  const original = JSON.stringify(records);
  const db = { collection(name) {
    assert.ok(Object.hasOwn(records, name), 'Only catalog collections may be read');
    return { find(query = {}) {
      let list = records[name].filter(doc => Object.entries(query).every(([key, value]) =>
        value?.$in ? value.$in.some(id => String(id) === String(doc[key]))
          : value?.$gt !== undefined ? doc[key] > value.$gt : doc[key] === value));
      let projection;
      return {
        project(value) { projection = value; return this; },
        sort(order) { list = [...list].sort((a, b) => {
          for (const [key, direction] of Object.entries(order)) {
            if (a[key] > b[key]) return direction; if (a[key] < b[key]) return -direction;
          } return 0;
        }); return this; },
        limit(count) { list = list.slice(0, count); return this; },
        async toArray() { return projection ? list.map(doc => Object.fromEntries(Object.entries(doc).filter(([key]) => key === '_id' || projection[key] === 1))) : list; },
      };
    } };
  } };
  const customerRoutes = require('./customer');
  const app = express(); app.use(express.json());
  // Execute the real inline catalog route without starting index.js, loading
  // dotenv, opening MongoClient, or creating the startup newsletter index.
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const start = source.indexOf("app.get('/api/books',");
  const end = source.indexOf('// API lấy danh sách tác giả', start);
  assert(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    app, database: db, customerRoutes, console,
    listParam: value => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean),
  });
  // Real recommendation route with a deterministic provider response; no
  // external AI calls or real credentials are used by this test.
  const librarianPath = path.join(__dirname, 'librarian.js');
  const nativeRequire = createRequire(librarianPath);
  const sandboxModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(librarianPath, 'utf8'), {
    module: sandboxModule, exports: sandboxModule.exports, console,
    process: { env: { GEMINI_API_KEY: 'fixture-only' } },
    require: name => name === '@google/genai' ? {
      Type: { OBJECT: 'object', STRING: 'string', ARRAY: 'array' },
      GoogleGenAI: class { models = { generateContent: async () => ({
        text: JSON.stringify({ reply: 'Recommendations', books: [{ code: 'B1', reason: 'Paid' }, { code: 'B2', reason: 'Free' }] }),
      }) }; },
    } : nativeRequire(name),
  }, { filename: librarianPath });
  app.use('/api', sandboxModule.exports(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const forbidden = ['fileUrl', 'pdfUrl', 'previewUrl', 'htmlUrl', 'sourceUrl', 'pdfSourcePage', 'ebookFileId', 'ebookMetadata'];
  const assertPaid = book => {
    for (const key of forbidden) assert.equal(Object.hasOwn(book, key), false, key + ' must not be public');
    for (const key of ['title', 'bookType', 'price', 'originalPrice', 'discountPercent', 'stock', 'status', 'image', 'description', 'language', 'pages'])
      assert.equal(book[key], paid[key], key + ' must remain compatible with my-app');
    assert.equal(book.authorId, String(paid.authorId)); assert.equal(book.categoryId, String(paid.categoryId));
    assert.equal(JSON.stringify(book).includes('https://content.invalid/'), false);
  };
  const listResponse = await fetch(base + '/api/books?limit=500');
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json(); assert.equal(list.length, 3); assertPaid(list[0]);
  assert.deepEqual(list[1], JSON.parse(JSON.stringify(free))); assert.deepEqual(list[2], JSON.parse(JSON.stringify(physical)));
  const filtered = await (await fetch(base + '/api/books?format=ebook&discounted=true&limit=1')).json();
  assert.equal(filtered.length, 1); assertPaid(filtered[0]);
  const recommendedResponse = await fetch(base + '/api/librarian', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Recommend books' }),
  });
  assert.equal(recommendedResponse.status, 200); const recommended = await recommendedResponse.json();
  assert.equal(recommended.books.length, 2); assertPaid(recommended.books[0]);
  assert.equal(recommended.books[0].authorName, 'Author'); assert.equal(recommended.books[0].reason, 'Paid');
  assert.equal(recommended.books[1].pdfUrl, free.pdfUrl);
  assert.equal((await fetch(base + '/api/books/' + paid._id)).status, 404, 'No public book-detail endpoint exists');
  assert.equal(JSON.stringify(records), original, 'Redaction must not modify stored metadata');
});


test('PDF upload validation checks binary signature, structure, EOF, xref bounds and size', () => {
  const { validPdf, PDF_MAX_BYTES } = require('./admin-books');
  let text = '%PDF-1.4\n'; const offsets = [0];
  for (const object of ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream']) {
    offsets.push(Buffer.byteLength(text)); text += `${offsets.length - 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 5\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  text += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  assert(validPdf(Buffer.from(text)));
  for (const bad of ['<html>Not PDF</html>', text.replace('%%EOF', 'MISSING'), text.replace(`startxref\n${xref}`, 'startxref\n99999999'), '%PDF-1.4\n' + 'x'.repeat(100) + '\n%%EOF'])
    assert.equal(validPdf(Buffer.from(bad)), false);
  assert.equal(validPdf(Buffer.alloc(PDF_MAX_BYTES + 1)), false);
});


test('PDF xref validation accepts linearized/incremental layouts and rejects broken tables, roots, cycles and fake headers', () => {
  const { validPdf } = require('./admin-books');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  const table = (offsets, root = true, prev) => 'xref\n0 5\n0000000000 65535 f \n' +
    offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size 5' + (root ? ' /Root 1 0 R' : '') + (prev == null ? '' : ' /Prev ' + String(prev).padStart(10, '0')) + ' >>\n';
  const build = (linearized = false, cyclic = false) => {
    let text = '%PDF-1.4\n'; const frontOffset = text.length, placeholder = linearized ? table([0, 0, 0, 0, 0], true, 0) : '';
    text += placeholder; const offsets = [0];
    for (const [i, object] of objects.entries()) { offsets.push(text.length); text += (i + 1) + ' 0 obj\n' + object + '\nendobj\n'; }
    if (linearized) text += '% ' + 'padding'.repeat(600) + '\n';
    const mainOffset = text.length; text += table(offsets, !linearized);
    if (linearized) text = text.slice(0, frontOffset) + table(offsets, true, cyclic ? frontOffset : mainOffset) + text.slice(frontOffset + placeholder.length);
    return text + 'startxref\n' + (linearized ? frontOffset : mainOffset) + '\n%%EOF\n';
  };
  const classic = build(), linearized = build(true);
  assert(validPdf(Buffer.from(classic))); assert(validPdf(Buffer.from(linearized)));
  assert.equal(/\/Root/.test(linearized.slice(-2048)), false, 'Fixture reproduces Root outside the old tail window');
  for (const bad of [
    classic.replace('%PDF-', '%TXT-'), classic.replace('/Root 1 0 R', '/Root 99 0 R'),
    classic.replace('/Type /Catalog', '/Type /NotBook'), classic.replace('xref\n0 5', 'xref\n0 9'),
    classic.replace(/(\d{10}) 00000 n/, '9999999999 00000 n'), classic.replace('%%EOF', ''),
    build(true, true), '%PDF-1.4\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n9\n%%EOF\n',
  ]) assert.equal(validPdf(Buffer.from(bad)), false);
  // An incremental trailer may inherit /Root through /Prev.
  const previousOffset = Number(/startxref\n(\d+)/.exec(classic)[1]);
  const appendedOffset = classic.length;
  const updated = classic + 'xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 5 /Prev ' + previousOffset +
    ' >>\nstartxref\n' + appendedOffset + '\n%%EOF\n';
  assert(validPdf(Buffer.from(updated)));

  let streamPdf = '%PDF-1.5\n'; const offsets = [0];
  for (const [i, object] of objects.slice(0, 3).entries()) { offsets.push(streamPdf.length); streamPdf += (i + 1) + ' 0 obj\n' + object.replace(' /Contents 4 0 R', '') + '\nendobj\n'; }
  offsets.push(streamPdf.length);
  const xrefBytes = Buffer.alloc(5 * 7);
  for (let i = 0; i < 5; i++) { xrefBytes[i * 7] = i ? 1 : 0; xrefBytes.writeUInt32BE(offsets[i], i * 7 + 1); xrefBytes.writeUInt16BE(i ? 0 : 65535, i * 7 + 5); }
  const stream = Buffer.concat([Buffer.from(streamPdf + '4 0 obj\n<< /Type /XRef /Size 5 /Root 1 0 R /W [1 4 2] /Length 35 >>\nstream\n'),
    xrefBytes, Buffer.from('\nendstream\nendobj\nstartxref\n' + offsets[4] + '\n%%EOF\n')]);
  assert(validPdf(stream));
  assert.equal(validPdf(Buffer.from(stream.toString('latin1').replace('/W [1 4 2]', '/W [1 4]'), 'latin1')), false);
  assert.equal(validPdf(Buffer.from(stream.toString('latin1').replace('/Root 1 0 R', '/Root 9 0 R'), 'latin1')), false);
});

test('Banner schedule uses exact timestamps including both boundaries without modifying legacy source', () => {
  const present = require('./admin-banners').present;
  const now = new Date('2026-11-12T12:00:00Z');
  const doc = { _id: new ObjectId(), title: 'Schedule', position: 'hero', status: 'active', startAt: now, endAt: now };
  assert.equal(present(doc, now).state, 'live');
  assert.equal(present({ ...doc, startAt: new Date(+now + 1), endAt: new Date(+now + 10) }, now).state, 'scheduled');
  assert.equal(present({ ...doc, startAt: new Date(+now - 10), endAt: new Date(+now - 1) }, now).state, 'expired');
  assert.equal(present({ ...doc, status: 'inactive' }, now).state, 'off');
  const before = JSON.stringify(doc);
  present(doc, now);
  assert.equal(JSON.stringify(doc), before);
});

test('Admin revisions preserve legacy null, detect stale snapshots and advance monotonically', () => {
  assert.equal(revisions.revision({}), null);
  assert.deepEqual(revisions.snapshot({}), { updatedAt: { $exists: false } });
  assert.doesNotThrow(() => revisions.requireRevision({ revision: null }, {}));
  assert.doesNotThrow(() => revisions.requireRevision({ revision: '2026-01-01T00:00:00Z' }, { updatedAt: new Date('2026-01-01T00:00:00.000Z') }));
  assert.throws(() => revisions.requireRevision({}, {}), (e) => e.status === 409);
  assert.throws(() => revisions.requireRevision({ revision: null }, { updatedAt: 'invalid' }), (e) => e.status === 409);
  const future = new Date('2099-01-01T00:00:00Z');
  assert.equal(+revisions.nextUpdatedAt({ updatedAt: future }), +future + 1);
});

test('Books and banners reject stale edits before writes and use atomic revision predicates', async (t) => {
  const bookId = new ObjectId(), bannerId = new ObjectId(), categoryId = new ObjectId();
  const initial = new Date('2026-01-01T00:00:00Z');
  const docs = {
    books: [{ _id: bookId, title: 'Original', categoryId, authorId: null, bookType: 'new',
      price: 100, originalPrice: 100, stock: 5, status: 'active', updatedAt: initial }],
    categories: [{ _id: categoryId, name: 'Fixture', slug: 'fixture' }], authors: [],
    banners: [{ _id: bannerId, name: 'Original', title: 'Fixture', position: 'hero', active: true, updatedAt: initial }],
    users: [],
    orders: [{ _id: new ObjectId(), userId: new ObjectId(), status: 'pending', items: [], updatedAt: initial }],
    return_requests: [{ _id: new ObjectId(), userId: new ObjectId(), status: 'pending', items: [], updatedAt: initial }],
  };
  let writes = 0, interfere = false;
  const equal = (a, b) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : String(a) === String(b);
  function match(doc, query) {
    return Object.entries(query).every(([key, value]) => {
      if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
        if ('$in' in value) return value.$in.some((v) => equal(doc[key], v));
        if ('$ne' in value) return !equal(doc[key], value.$ne);
        if ('$exists' in value) return Object.hasOwn(doc, key) === value.$exists;
      }
      return equal(doc[key], value);
    });
  }
  const db = { collection: (name) => ({
    findOne: async (query) => docs[name].find((doc) => match(doc, query)) ?? null,
    find: (query = {}) => ({
      project() { return this; }, sort() { return this; }, limit() { return this; },
      toArray: async () => docs[name].filter((doc) => match(doc, query)),
    }),
    updateOne: async (query, update) => {
      assert.ok(Object.hasOwn(query, 'updatedAt'), 'mutation must compare the loaded revision');
      if (interfere) return { matchedCount: 0 };
      const doc = docs[name].find((doc) => match(doc, query));
      if (!doc) return { matchedCount: 0 };
      writes++; Object.assign(doc, update.$set);
      return { matchedCount: 1 };
    },
    insertOne: async () => { throw new Error('No insert expected'); },
  }) };
  const app = express(); app.use(express.json());
  app.use(require('./admin-books')(() => db));
  app.use(require('./admin-banners')(() => db));
  app.use(require('./admin-orders')(() => db));
  app.use(require('./admin-returns')(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = (path, body, method = 'PUT') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const book = { title: 'Updated', categoryId: String(categoryId), bookType: 'new', price: 100, stock: 5, status: 'active' };
  assert.equal((await put('/books/' + bookId, book)).status, 409);
  assert.equal(writes, 0);
  assert.equal((await put('/books/' + bookId, { ...book, revision: initial.toISOString() })).status, 200);
  assert.equal(writes, 1);
  assert.equal((await put('/books/' + bookId, { ...book, revision: initial.toISOString() })).status, 409);
  assert.equal(writes, 1);
  interfere = true;
  assert.equal((await put('/books/' + bookId, { ...book, revision: new Date(docs.books[0].updatedAt).toISOString() })).status, 409);
  assert.equal(writes, 1);
  interfere = false;
  const banner = { name: 'Updated', title: 'Fixture', position: 'hero', active: true };
  assert.equal((await put('/admin/banners/' + bannerId, banner)).status, 409);
  assert.equal((await put('/admin/banners/' + bannerId, { ...banner, revision: initial.toISOString() })).status, 200);
  const before = writes;
  assert.equal((await put('/admin/banners/' + bannerId, { active: false, revision: initial.toISOString() }, 'PATCH')).status, 409);
  assert.equal(writes, before);
  assert.equal((await put('/admin/banners', { ...banner, active: 'false' }, 'POST')).status, 400);
  assert.equal(writes, before);
  assert.equal((await put('/admin/banners/' + bannerId, { revision: initial.toISOString() }, 'DELETE')).status, 409);
  assert.equal(writes, before);
  for (const [path, doc] of [['orders', docs.orders[0]], ['returns', docs.return_requests[0]]]) {
    assert.equal((await put(`/${path}/${doc._id}`, { adminNote: 'New note', revision: initial.toISOString() }, 'PATCH')).status, 200);
    const after = writes;
    assert.equal((await put(`/${path}/${doc._id}`, { adminNote: 'Stale note', revision: initial.toISOString() }, 'PATCH')).status, 409);
    assert.equal(writes, after);
    assert.equal(doc.adminNote, 'New note');
  }
});

test('Orders/Returns reject invalid calendar dates before database queries', async (t) => {
  const range = require('../middleware/admin-date-range');
  assert.equal(range({ from: '2026-11-08' }).from.toISOString(), '2026-11-07T17:00:00.000Z');
  assert.equal(range({ to: '2026-11-08' }).to.toISOString(), '2026-11-08T16:59:59.999Z');
  const app = express();
  const getDb = () => { throw new Error('No DB query permitted for invalid filters'); };
  app.use(require('./admin-orders')(getDb));
  app.use(require('./admin-returns')(getDb));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const resource of ['orders', 'returns']) {
    for (const query of ['from=2026-02-30', 'to=2026-13-01', 'from=x', 'from=2026-11-10&to=2026-11-08']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/${resource}?${query}`);
      assert.equal(response.status, 400);
    }
  }
});

test('Banner reorder commits atomically and rolls back if a later banner changed', async (t) => {
  const a = new ObjectId(), b = new ObjectId();
  let rows = [{ _id: a, position: 'hero', order: 1 }, { _id: b, position: 'hero', order: 2 }];
  let failSecond = false, updates = 0, ended = 0;
  const db = {
    admin: () => ({ command: async () => ({ setName: 'fixture' }) }),
    client: { startSession: () => ({
      async withTransaction(work) {
        const snapshot = rows.map((row) => ({ ...row }));
        try { return await work(); } catch (error) { rows = snapshot; throw error; }
      },
      async endSession() { ended++; },
    }) },
    collection: () => ({
      find: (query) => ({ toArray: async () => rows.filter((row) => query.position
        ? row.position === query.position : query._id.$in.some((id) => String(id) === String(row._id))) }),
      updateOne: async (query, update, options) => {
        assert.ok(options.session);
        if (failSecond && String(query._id) === String(b)) return { matchedCount: 0 };
        const row = rows.find((row) => String(row._id) === String(query._id));
        if (!row) return { matchedCount: 0 };
        updates++; Object.assign(row, update.$set); return { matchedCount: 1 };
      },
    }),
  };
  const app = express(); app.use(express.json()); app.use(require('./admin-banners')(() => db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const send = (ids, revisions) => fetch(`http://127.0.0.1:${server.address().port}/admin/banners/reorder`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, revisions }),
  });
  const ids = [String(a), String(b)], revisionsMap = { [a]: null, [b]: null };
  failSecond = true;
  assert.equal((await send(ids, revisionsMap)).status, 409);
  assert.equal(rows[0].updatedAt, undefined);
  assert.equal(rows[1].updatedAt, undefined);
  assert.equal(ended, 1);
  failSecond = false;
  assert.equal((await send([...ids].reverse(), revisionsMap)).status, 200);
  assert.equal(rows.find((row) => String(row._id) === String(b)).order, 1);
  const before = updates;
  assert.equal((await send(ids, revisionsMap)).status, 409);
  assert.equal(updates, before);
  assert.equal((await send([String(a), String(a)], revisionsMap)).status, 400);
  delete db.client;
  const fresh = Object.fromEntries(rows.map((row) => [String(row._id), row.updatedAt.toISOString()]));
  assert.equal((await send(ids, fresh)).status, 503);
  assert.equal(updates, before);
});

test('Banner legacy CRUD preserves position, precise schedule, status/order aliases and unique code; invalid/conflicting records cannot write', async (t) => {
  const { BSON } = require('mongodb');
  const clone = value => BSON.deserialize(BSON.serialize({ value })).value;
  const initial = new Date('2026-10-01'), startAt = new Date('2026-10-04T09:41:13.104Z'), endAt = new Date('2027-04-04T09:41:13.104Z');
  let rows = [
    { _id: new ObjectId(), code: 'LEGACY-A', title: 'Used books', link: '/books?type=used', position: 'home_secondary', status: 'active', sortOrder: 2, startAt, endAt, updatedAt: initial },
    { _id: new ObjectId(), code: 'LEGACY-B', title: 'Buyback', link: '/book-buyback', position: 'home_secondary', status: 'active', sortOrder: 3, startAt, endAt, updatedAt: initial },
    { _id: new ObjectId(), code: 'LEGACY-HERO', title: 'Hero', link: '/books', position: 'hero', status: 'active', sortOrder: 1, startAt, endAt,
      startDate: new Date('2026-10-03T17:00:00Z'), endDate: new Date('2027-04-04T16:59:59.999Z'), updatedAt: initial },
  ];
  let writes = 0;
  const equal = (a, b) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : String(a) === String(b);
  const match = (row, query) => Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId)) {
      if ('$in' in value) return value.$in.some(v => equal(v, row[key]));
      if ('$exists' in value) return Object.hasOwn(row, key) === value.$exists;
    }
    return equal(row[key], value);
  });
  const db = { collection: name => {
    assert.equal(name, 'banners');
    return {
      find: (query = {}) => ({ toArray: async () => clone(rows.filter(row => match(row, query))) }),
      findOne: async query => clone(rows.find(row => match(row, query)) || null),
      insertOne: async doc => {
        assert.equal(typeof doc.code, 'string');
        assert(!rows.some(row => row.code === doc.code), 'Atlas unique code index');
        rows.push(clone(doc)); writes++; return { insertedId: doc._id };
      },
      updateOne: async (query, update) => {
        assert(Object.hasOwn(query, 'updatedAt'));
        const row = rows.find(row => match(row, query));
        if (!row) return { matchedCount: 0 };
        Object.assign(row, clone(update.$set));
        for (const key of Object.keys(update.$unset || {})) delete row[key];
        writes++; return { matchedCount: 1 };
      },
      deleteOne: async query => {
        const index = rows.findIndex(row => match(row, query));
        if (index < 0) return { deletedCount: 0 };
        rows.splice(index, 1); writes++; return { deletedCount: 1 };
      },
    };
  } };
  const app = express(); app.use(express.json()); app.use(require('./admin-banners')(() => db));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (url, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}` + url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const original = clone(rows);
  let list = await request('/admin/banners');
  assert(list.body.positions.includes('home_secondary'));
  assert.deepEqual(list.body.items.find(row => row._id === String(rows[0]._id)).contractIssues, []);
  assert.equal(list.body.items.find(row => row._id === String(rows[0]._id)).order, 2);
  assert.equal(writes, 0); assert.deepEqual(rows, original);
  const heroId = String(rows[2]._id);
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const response = await request('/admin/banners/' + heroId, method, { active: false, revision: initial.toISOString() });
    assert.equal(response.status, 409); assert(response.body.message.includes(heroId)); assert(response.body.message.includes('startDate'));
  }
  assert.equal(writes, 0);
  const payload = { name: 'Used books', title: 'Edited title', subtitle: '', image: '', link: '/books?type=used',
    bgColor: '#1c1917', textColor: '#ffffff', position: 'home_secondary', active: true, startDate: '2026-10-04', endDate: '2027-04-04' };
  const edited = await request('/admin/banners/' + rows[0]._id, 'PUT', { ...payload, revision: initial.toISOString() });
  assert.equal(edited.status, 200); assert.equal(rows[0].position, 'home_secondary');
  assert.equal(+rows[0].startAt, +startAt); assert.equal(+rows[0].endAt, +endAt);
  assert.equal(Object.hasOwn(rows[0], 'startDate'), false); assert.equal(Object.hasOwn(rows[0], 'order'), false);
  assert.equal(rows[0].sortOrder, 2); assert.equal(rows[0].status, 'active');
  assert.equal((await request('/admin/banners/' + rows[0]._id, 'PATCH', { active: false, revision: edited.body.updatedAt })).status, 200);
  assert.equal(rows[0].status, 'inactive'); assert.equal(Object.hasOwn(rows[0], 'active'), false);
  assert.equal((await request('/banners?position=home_secondary')).body.length, 1);
  const cleared = await request('/admin/banners/' + rows[0]._id, 'PUT', { ...payload, startDate: '', endDate: '', revision: rows[0].updatedAt.toISOString() });
  assert.equal(cleared.status, 200);
  assert.equal(Object.hasOwn(rows[0], 'startAt'), false); assert.equal(Object.hasOwn(rows[0], 'endAt'), false);
  const beforeInvalid = writes;
  for (const invalid of [{ position: '' }, { image: '//evil.test/a.png' }, { link: 'https://?' }, { link: '/\\evil.test' },
    { link: 'javascript:alert(1)' }, { link: 'https://user:password@example.test' }, { startDate: '2026-02-30' },
    { startDate: '2026-10-04T09:00:00Z' }, { startDate: '2028-01-01' }, { name: 'x'.repeat(121) }])
    assert.equal((await request('/admin/banners', 'POST', { ...payload, ...invalid })).status, 400, JSON.stringify(invalid));
  assert.equal(writes, beforeInvalid);
  const created = await request('/admin/banners', 'POST', payload);
  const second = await request('/admin/banners', 'POST', payload);
  assert.equal(created.status, 201); assert.equal(second.status, 201);
  assert.notEqual(rows.at(-1).code, rows.at(-2).code); assert.equal(rows.at(-2).sortOrder, 4); assert.equal(rows.at(-1).sortOrder, 5);
  assert.equal((await request('/admin/banners/' + created.body._id, 'DELETE', { revision: created.body.updatedAt })).status, 200);
  rows.push({ _id: new ObjectId(), title: 'Invalid date', active: true, position: 'hero', startAt: 'not-a-date' },
    { _id: new ObjectId(), title: 'Demo', active: true, position: 'hero', isDemo: true });
  list = await request('/admin/banners');
  assert(list.body.items.find(row => row.name === 'Invalid date').contractIssues.includes('startAt_invalid'));
  const publicList = (await request('/banners')).body;
  assert(!publicList.some(row => ['Invalid date', 'Demo'].includes(row.title)));
  assert.deepEqual(rows.find(row => String(row._id) === heroId), original[2]);
});
