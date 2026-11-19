'use strict';
async function migrateOtp(db) {
  const names = await db.listCollections({}, { nameOnly: true }).toArray();
  if (!names.some(c => c.name === 'otp_challenges')) return 0;
  let copied = 0;
  for await (const row of db.collection('otp_challenges').find({ expiresAt: { $gt: new Date() }, consumedAt: null })) {
    const { _id, ...fields } = row;
    if (fields.codeHash == null && fields.accountId == null)
      fields.codeHash = require('./customer-auth').digest('invalid-legacy:' + String(_id));
    const result = await db.collection('otp').updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    copied += result.upsertedCount;
  }
  return copied;
}
async function prepareOtpStorage(db) {
  await db.collection('otp').createIndex({ challengeId: 1 }, { unique: true });
  await db.collection('otp').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
  const indexes = await db.collection('otp').listIndexes().toArray();
  const legacy = indexes.find(index => index.name === 'otp_expire' && index.key?.createdAt === 1 &&
    Object.keys(index.key).length === 1 && index.expireAfterSeconds === 600);
  if (legacy) {
    try { await db.collection('otp').dropIndex(legacy.name); }
    catch (error) { if (error.code !== 27) throw error; }
  }
}
module.exports = async function prepareDataFlows(db) {
  await prepareOtpStorage(db);
  return { otpMigrated: await migrateOtp(db) };
};
module.exports.migrateOtp = migrateOtp;
module.exports.prepareOtpStorage = prepareOtpStorage;
