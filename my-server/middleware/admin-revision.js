// Compare-and-set using the document's existing updatedAt field; no schema change.
function conflict() {
  return Object.assign(new Error('Dữ liệu đã thay đổi. Tải lại bản mới trước khi lưu.'), { status: 409 });
}
function revision(doc) {
  if (doc.updatedAt == null) return null;
  const date = new Date(doc.updatedAt);
  if (!Number.isFinite(date.getTime())) throw conflict();
  return date.toISOString();
}
function requireRevision(body, doc) {
  if (!Object.hasOwn(body || {}, 'revision')) throw conflict();
  const expected = revision(doc);
  if (expected === null && body.revision === null) return;
  if (typeof body.revision !== 'string') throw conflict();
  const supplied = new Date(body.revision);
  if (!Number.isFinite(supplied.getTime()) || supplied.toISOString() !== expected) throw conflict();
}
function snapshot(doc) {
  return { updatedAt: Object.hasOwn(doc, 'updatedAt') ? doc.updatedAt : { $exists: false } };
}
function nextUpdatedAt(doc) {
  const current = revision(doc);
  return new Date(Math.max(Date.now(), current ? Date.parse(current) + 1 : 0));
}
module.exports = { revision, requireRevision, snapshot, nextUpdatedAt, conflict };
