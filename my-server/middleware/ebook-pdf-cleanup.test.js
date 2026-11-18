const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const cleanup = require('./ebook-pdf-cleanup');

function pdf() {
  let text = '%PDF-1.4\n'; const offsets = [];
  for (const object of ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream']) {
    offsets.push(Buffer.byteLength(text)); text += `${offsets.length} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 5\n0000000000 65535 f \n' + offsets.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(text + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
function fixture() {
  const valid = { _id: new ObjectId(), bookType: 'ebook', title: 'Valid', status: 'active', ebookFileId: new ObjectId() };
  const missing = { _id: new ObjectId(), bookType: 'ebook', title: 'Missing', status: 'active' };
  const corrupt = { _id: new ObjectId(), bookType: 'ebook', title: 'Corrupt', status: 'active', ebookFileId: new ObjectId() };
  let books = [valid, missing, corrupt], conflict = false;
  const files = [valid, corrupt].map(b => ({ _id: b.ebookFileId, length: 500, metadata: { bookId: b._id, verified: true } }));
  const session = { async withTransaction(work) { const before = books.map(b => ({ ...b })); try { return await work(); } catch (e) { books = before; throw e; } }, async endSession() {} };
  const db = { client: { startSession: () => session }, admin: () => ({ command: async () => ({ setName: 'fixture' }) }),
    collection: name => name === 'fs.files' ? { find: () => ({ toArray: async () => files }) } : {
      find: () => ({ toArray: async () => books.map(b => ({ ...b })) }),
      async updateOne(query, update, options) {
        assert.equal(options.session, session); assert.equal(query.bookType, 'ebook');
        if (conflict) return { modifiedCount: 0 };
        const b = books.find(b => String(b._id) === String(query._id));
        Object.assign(b, update.$set); return { modifiedCount: 1 };
      },
    } };
  return { db, valid, missing, corrupt, get books() { return books; }, conflict: () => { conflict = true; },
    read: async (_db, id) => String(id) === String(valid.ebookFileId) ? pdf() : Buffer.from('<html>Not PDF</html>') };
}
test('Cleanup keeps real readable PDFs and removes only missing/corrupt ebooks from the catalog', async () => {
  const f = fixture(), plan = await cleanup.inspect(f.db, f.read);
  assert.deepEqual(plan.readable.map(b => b.title), ['Valid']);
  assert.deepEqual(plan.missing.map(b => b.title), ['Missing', 'Corrupt']);
  const removed = await cleanup.apply(f.db, plan); assert.equal(removed.length, 2);
  assert.equal(f.valid.status, 'active'); assert.equal(f.books[1].status, 'deleted');
  assert.equal(f.books[2].deletionReason, 'missing_readable_pdf');
});
test('Cleanup aborts on PDF read failures and refuses stale catalog snapshots', async () => {
  const f = fixture();
  await assert.rejects(cleanup.inspect(f.db, async () => { throw new Error('Network unavailable'); }), /Network unavailable/);
  assert.ok(f.books.every(b => b.status === 'active'));
  const plan = await cleanup.inspect(f.db, f.read); f.conflict();
  await assert.rejects(cleanup.apply(f.db, plan), e => e.status === 409);
  assert.ok(f.books.every(b => b.status === 'active'));
});
