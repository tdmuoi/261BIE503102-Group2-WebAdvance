module.exports = async function adminTransaction(db, work) {
  const unavailable = () => Object.assign(new Error('Thao tác cần MongoDB replica set hoặc sharded transaction. Chưa ghi thay đổi.'), { status: 503 });
  if (!db.client?.startSession || !db.admin) throw unavailable();
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw unavailable();
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary',
    });
  } finally { await session.endSession(); }
};
