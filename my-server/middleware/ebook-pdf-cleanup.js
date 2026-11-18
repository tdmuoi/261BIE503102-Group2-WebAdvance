'use strict';
const { GridFSBucket } = require('mongodb');
const { verifiedPdfBooks, validPdf, PDF_MAX_BYTES } = require('../routes/admin-books');
const revisions = require('./admin-revision');
const transaction = require('./admin-transaction');

async function readPdf(db, id) {
  const chunks = []; let size = 0;
  for await (const chunk of new GridFSBucket(db).openDownloadStream(id)) {
    size += chunk.length;
    if (size > PDF_MAX_BYTES) throw new Error('PDF exceeds the reader size limit; inspect before cleanup.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function inspect(db, read = readPdf) {
  const books = await db.collection('books').find({ bookType: 'ebook', status: { $ne: 'deleted' } }).toArray();
  const ready = await verifiedPdfBooks(db, books);
  const missing = [], readable = [];
  for (const book of books) {
    if (!ready.has(String(book._id))) { missing.push(book); continue; }
    // A read/network error aborts inspection; never classify temporary failures as missing files.
    if (!validPdf(await read(db, book.ebookFileId))) missing.push(book);
    else readable.push(book);
  }
  return { books, missing, readable };
}
async function apply(db, plan) {
  return transaction(db, async session => {
    const removed = [];
    for (const book of plan.missing) {
      const now = revisions.nextUpdatedAt(book);
      const result = await db.collection('books').updateOne({ _id: book._id, bookType: 'ebook', status: book.status,
        ebookFileId: Object.hasOwn(book, 'ebookFileId') ? book.ebookFileId : { $exists: false }, ...revisions.snapshot(book) },
        { $set: { status: 'deleted', deletedAt: now, updatedAt: now, deletionReason: 'missing_readable_pdf' } }, { session });
      if (result.modifiedCount !== 1) throw revisions.conflict();
      removed.push({ id: String(book._id), title: book.title });
    }
    return removed;
  });
}
module.exports = { inspect, apply };
