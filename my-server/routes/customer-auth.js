// =====================================================================
// Đăng ký / đăng nhập cho web khách hàng
//   POST /api/auth/register         { fullName, email, phone?, password, newsletter }
//   POST /api/auth/login            { identifier, type: 'email'|'phone', password, remember }
//   POST /api/auth/logout           (Bearer token)
//   GET  /api/auth/me               (Bearer token)
//   POST /api/auth/forgot-password  { email }  — luôn trả 200 (chưa gửi email thật)
// Tài khoản: accounts { email, passwordHash, provider:'local', roleCode:'CUSTOMER', status }
//            users    { accountId, fullName, username, phone, gender, avatar, dateOfBirth }
// =====================================================================
const express = require('express');
const { hashPassword, verifyPassword, createSession, deleteSession, requireCustomer } = require('../middleware/customer-auth');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^0\d{9}$/;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const WELCOME_CODE = 'WELCOME10';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** User trả cho trang (models/user.ts) */
function publicUser(account, user) {
  return { _id: String(user._id), fullName: user.fullName || '', email: account.email, phone: user.phone || null, avatar: user.avatar || null };
}

module.exports = function customerAuthRoutes(getDb) {
  const router = express.Router();
  const db = () => getDb();

  router.post('/auth/register', async (req, res, next) => {
    try {
      const fullName = text(req.body?.fullName);
      const email = text(req.body?.email).toLowerCase();
      const phone = text(req.body?.phone) || null;
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ message: 'Họ tên cần từ 2 đến 80 ký tự' });
      if (!EMAIL_PATTERN.test(email) || email.length > 254) return res.status(400).json({ message: 'Email không hợp lệ', field: 'email' });
      if (phone && !PHONE_PATTERN.test(phone)) return res.status(400).json({ message: 'Số điện thoại không hợp lệ', field: 'phone' });
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || Buffer.byteLength(password) > 72) {
        return res.status(400).json({ message: 'Mật khẩu cần ít nhất 8 ký tự, có cả chữ và số' });
      }
      const exists = await db().collection('accounts').findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
      if (exists) return res.status(409).json({ message: 'Email này đã được đăng ký', field: 'email' });
      if (phone && (await db().collection('users').findOne({ phone }))) {
        return res.status(409).json({ message: 'Số điện thoại này đã được đăng ký', field: 'phone' });
      }

      const now = new Date();
      const account = {
        email, passwordHash: await hashPassword(password), provider: 'local', providerId: null,
        roleCode: 'CUSTOMER', status: 'active', lastLogin: now, createdAt: now, updatedAt: now,
      };
      account._id = (await db().collection('accounts').insertOne(account)).insertedId;
      const user = {
        accountId: account._id, fullName, username: email.split('@')[0], phone, gender: null,
        avatar: null, dateOfBirth: null, createdAt: now, updatedAt: now,
      };
      try {
        user._id = (await db().collection('users').insertOne(user)).insertedId;
      } catch (error) {
        await db().collection('accounts').deleteOne({ _id: account._id });
        throw error;
      }

      if (req.body?.newsletter === true) {
        await db().collection('newsletters')
          .updateOne({ email }, { $addToSet: { topics: 'news' }, $setOnInsert: { createdAt: now } }, { upsert: true })
          .catch(() => undefined);
      }
      await db().collection('notifications').insertOne({
        userId: user._id, type: 'promo', icon: 'tag', title: 'Chào mừng bạn đến với Lightbook',
        message: 'Cảm ơn bạn đã đăng ký tài khoản. Chúc bạn tìm được những cuốn sách thật hay!',
        read: false, action: { label: 'Khám phá sách', link: '/books' }, createdAt: now,
      });

      const welcome = await db().collection('vouchers').findOne({ code: WELCOME_CODE, status: 'active' });
      const { token } = await createSession(db(), { accountId: account._id, userId: user._id, remember: true });
      res.status(201).json({ token, user: publicUser(account, user), coupon: welcome ? { code: WELCOME_CODE } : null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/login', async (req, res, next) => {
    try {
      const identifier = text(req.body?.identifier);
      const type = req.body?.type === 'phone' ? 'phone' : 'email';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!identifier || !password) return res.status(400).json({ message: 'Vui lòng nhập đủ thông tin đăng nhập' });

      let account = null;
      let user = null;
      if (type === 'phone') {
        user = await db().collection('users').findOne({ phone: identifier });
        account = user ? await db().collection('accounts').findOne({ _id: user.accountId }) : null;
      } else {
        account = await db().collection('accounts').findOne({ email: { $regex: `^${escapeRegex(identifier.toLowerCase())}$`, $options: 'i' } });
        user = account ? await db().collection('users').findOne({ accountId: account._id }) : null;
      }
      const wrong = { message: `${type === 'phone' ? 'Số điện thoại' : 'Email'} hoặc mật khẩu chưa chính xác` };
      if (!account || !user || account.roleCode !== 'CUSTOMER') return res.status(401).json(wrong);
      if (account.status !== 'active') return res.status(403).json({ message: 'Tài khoản đang bị khoá, vui lòng liên hệ Lightbook' });
      if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
        return res.status(423).json({ message: 'Tài khoản tạm khoá do nhập sai nhiều lần', lockedUntil: new Date(account.lockedUntil).toISOString() });
      }

      if (!(await verifyPassword(password, account.passwordHash))) {
        const fails = (account.failedLogins || 0) + 1;
        if (fails >= MAX_FAILS) {
          const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
          await db().collection('accounts').updateOne({ _id: account._id }, { $set: { failedLogins: 0, lockedUntil } });
          return res.status(423).json({ message: 'Tài khoản tạm khoá do nhập sai nhiều lần', lockedUntil: lockedUntil.toISOString() });
        }
        await db().collection('accounts').updateOne({ _id: account._id }, { $set: { failedLogins: fails } });
        return res.status(401).json({ ...wrong, remainingAttempts: MAX_FAILS - fails });
      }

      await db().collection('accounts').updateOne({ _id: account._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLogin: new Date() } });
      const { token } = await createSession(db(), { accountId: account._id, userId: user._id, remember: req.body?.remember === true });
      res.json({ token, user: publicUser(account, user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/logout', async (req, res, next) => {
    try {
      await deleteSession(db(), req);
      res.json({ message: 'Đã đăng xuất' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/auth/me', requireCustomer(getDb), (req, res) => {
    res.json({ user: publicUser(req.customer.account, req.customer.user) });
  });

  // Chưa có dịch vụ gửi email: luôn trả 200 để không lộ email nào đã đăng ký
  router.post('/auth/forgot-password', (req, res) => {
    res.json({ message: 'Nếu email đã đăng ký, Lightbook sẽ gửi hướng dẫn đặt lại mật khẩu.', resendAfter: 30 });
  });

  return router;
};

module.exports.publicUser = publicUser;
