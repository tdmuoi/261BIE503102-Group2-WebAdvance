// =====================================================================
// Đăng nhập cho web khách hàng (my-app). Không dùng chung phiên với trang admin.
//
// Token: chuỗi ngẫu nhiên gửi kèm header "Authorization: Bearer <token>".
// Database chỉ lưu SHA-256 của token trong collection customer_sessions
//   { tokenHash, accountId, userId, createdAt, expiresAt }  — tự xoá khi hết hạn (TTL index).
// Mọi API khách hàng lấy userId từ token, KHÔNG nhận userId do trang gửi lên.
// =====================================================================
const { randomBytes, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { ObjectId } = require('mongodb');

const derive = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS_REMEMBER = 30;
const SESSION_DAYS = 1;
const digest = (value) => createHash('sha256').update(value).digest('hex');

let indexesReady = null;
function ensureIndexes(db) {
  indexesReady ??= Promise.all([
    db.collection('customer_sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('customer_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
}

function bcrypt() {
  return require('bcryptjs');
}

async function hashPassword(password) {
  return bcrypt().hash(password, 10);
}

/** Đọc được mật khẩu bcrypt ($2a/$2b/$2y) và scrypt (dạng admin-auth dùng) */
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  if (/^\$2[aby]\$\d{2}\$/.test(encoded)) {
    if (Buffer.byteLength(password) > 72) return false;
    return bcrypt().compare(password, encoded);
  }
  const parts = encoded.split('$');
  if (parts.length === 6 && parts[0] === 'scrypt' && /^[a-f\d]{32}$/.test(parts[4]) && /^[a-f\d]{128}$/.test(parts[5])) {
    const key = await derive(password, parts[4], 64, SCRYPT_OPTIONS);
    const expected = Buffer.from(parts[5], 'hex');
    return expected.length === key.length && timingSafeEqual(key, expected);
  }
  return false;
}

async function createSession(db, { accountId, userId, remember }) {
  await ensureIndexes(db);
  const token = randomBytes(32).toString('hex');
  const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db.collection('customer_sessions').insertOne({ tokenHash: digest(token), accountId, userId, createdAt: new Date(), expiresAt });
  return { token, expiresAt };
}

function tokenOf(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+([a-f\d]{64})$/i.exec(header.trim());
  return match ? match[1].toLowerCase() : null;
}

async function deleteSession(db, req) {
  const token = tokenOf(req);
  if (token) await db.collection('customer_sessions').deleteOne({ tokenHash: digest(token) });
}

/** Middleware: bắt buộc đăng nhập. Gắn req.customer = { accountId, userId, email, account, user } */
function requireCustomer(getDb) {
  return async (req, res, next) => {
    try {
      const token = tokenOf(req);
      if (!token) return res.status(401).json({ message: 'Bạn cần đăng nhập để tiếp tục' });
      const db = getDb();
      if (!db) return res.status(503).json({ message: 'Máy chủ chưa sẵn sàng, vui lòng thử lại' });
      const session = await db.collection('customer_sessions').findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
      if (!session) return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
      const [account, user] = await Promise.all([
        db.collection('accounts').findOne({ _id: session.accountId }),
        db.collection('users').findOne({ _id: session.userId }),
      ]);
      if (!account || !user || account.roleCode !== 'CUSTOMER' || account.status !== 'active') {
        return res.status(401).json({ message: 'Tài khoản không còn hoạt động' });
      }
      req.customer = { accountId: account._id, userId: user._id, email: account.email, account, user };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function toObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}

module.exports = { hashPassword, verifyPassword, createSession, deleteSession, requireCustomer, toObjectId, digest };
