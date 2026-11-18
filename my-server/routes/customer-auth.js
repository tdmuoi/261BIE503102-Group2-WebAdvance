// =====================================================================
// Đăng ký / đăng nhập cho web khách hàng
//   POST /api/auth/register         { fullName, email, phone?, password, newsletter }
//                                   → 201 { verificationRequired, challengeId, email, resendAfter } (gửi OTP xác minh email;
//                                     CHƯA tạo tài khoản — tài khoản chỉ được tạo khi nhập đúng mã ở /auth/otp/verify)
//   POST /api/auth/login            { identifier, type: 'email'|'phone', password, remember }
//                                   → { token, user } hoặc, nếu cần OTP:
//                                     { verificationRequired | twoFactorRequired, challengeId, email, resendAfter }
//   POST /api/auth/otp/verify       { challengeId, code }  → { token, user, coupon? }
//   POST /api/auth/otp/resend       { challengeId }        → { challengeId, email, resendAfter }
//   POST /api/auth/forgot-password  { email }  → luôn 200 { challengeId, email, resendAfter } (không lộ email nào đã đăng ký)
//   POST /api/auth/reset-password   { challengeId, code, newPassword } → đổi mật khẩu, đăng xuất mọi thiết bị
//   POST /api/auth/logout           (Bearer token)
//   GET  /api/auth/me               (Bearer token)
// Tài khoản: accounts { email, passwordHash, provider:'local', roleCode:'CUSTOMER', status,
//                       emailVerified, emailVerificationPending }
//            users    { accountId, fullName, username, phone, gender, avatar, dateOfBirth, twoFactorEnabled }
// Tài khoản tạo trước khi có OTP không có emailVerificationPending nên vẫn đăng nhập bình thường.
// Tài khoản còn emailVerificationPending (tạo theo luồng cũ, chưa từng nhập OTP) không giữ chỗ email/SĐT:
// đăng ký lại được, và bị thay bằng tài khoản mới khi người đó nhập đúng mã.
// =====================================================================
const express = require('express');
const { hashPassword, verifyPassword, createSession, deleteSession, requireCustomer } = require('../middleware/customer-auth');
const { OtpError, startChallenge, resendChallenge, consumeChallenge, OTP_COLLECTION } = require('../middleware/customer-otp');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^0\d{9}$/;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const WELCOME_CODE = 'WELCOME10';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const weakPassword = (p) => p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p) || Buffer.byteLength(p) > 72;

/** Lỗi OTP (sai mã, hết hạn, gửi quá nhiều…) trả đúng mã HTTP; lỗi khác chuyển cho Express */
function otpFailure(res, next, error) {
  if (error instanceof OtpError) return res.status(error.status).json(error.body);
  return next(error);
}

/** User trả cho trang (models/user.ts) */
function publicUser(account, user) {
  return { _id: String(user._id), fullName: user.fullName || '', email: account.email, phone: user.phone || null, avatar: user.avatar || null };
}

/** Email / SĐT đã thuộc về một tài khoản thật (đã xác minh hoặc tạo trước khi có OTP)? */
async function takenBy(db, { email, phone }) {
  const accounts = db.collection('accounts');
  const byEmail = await accounts.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
  if (byEmail && byEmail.emailVerificationPending !== true) return 'email';
  if (phone) {
    const owner = await db.collection('users').findOne({ phone });
    if (owner) {
      const ownerAccount = await accounts.findOne({ _id: owner.accountId });
      if (!ownerAccount || ownerAccount.emailVerificationPending !== true) return 'phone';
    }
  }
  return null;
}

const TAKEN = {
  email: { message: 'Email này đã được đăng ký', field: 'email' },
  phone: { message: 'Số điện thoại này đã được đăng ký', field: 'phone' },
};

/** Xoá tài khoản "chờ xác minh" bỏ dở (luồng cũ) đang giữ email / SĐT này */
async function removeAbandoned(db, { email, phone }) {
  const accounts = db.collection('accounts');
  const users = db.collection('users');
  const stale = [];
  const byEmail = await accounts.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' }, emailVerificationPending: true });
  if (byEmail) stale.push(byEmail._id);
  if (phone) {
    const owner = await users.findOne({ phone });
    const ownerAccount = owner ? await accounts.findOne({ _id: owner.accountId, emailVerificationPending: true }) : null;
    if (ownerAccount) stale.push(ownerAccount._id);
  }
  for (const accountId of stale) {
    const user = await users.findOne({ accountId });
    if (user) {
      await db.collection('notifications').deleteMany({ userId: user._id });
      await users.deleteOne({ _id: user._id });
    }
    await accounts.deleteOne({ _id: accountId });
  }
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
      if (weakPassword(password)) {
        return res.status(400).json({ message: 'Mật khẩu cần ít nhất 8 ký tự, có cả chữ và số' });
      }
      const taken = await takenBy(db(), { email, phone });
      if (taken) return res.status(409).json(TAKEN[taken]);

      // Chưa tạo tài khoản: lưu tạm thông tin (mật khẩu đã băm) trong phiên OTP, gửi mã về email.
      // Nhập đúng mã ở POST /auth/otp/verify thì tài khoản mới được tạo.
      const pending = {
        fullName, email, phone, passwordHash: await hashPassword(password), newsletter: req.body?.newsletter === true,
      };
      const challenge = await startChallenge(db(), { purpose: 'register', email, remember: true, pending });
      res.status(201).json({ verificationRequired: true, ...challenge });
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  /** Tạo tài khoản sau khi đã xác minh email bằng OTP */
  async function createCustomer(pending, now) {
    await removeAbandoned(db(), pending);
    const account = {
      email: pending.email, passwordHash: pending.passwordHash, provider: 'local', providerId: null,
      roleCode: 'CUSTOMER', status: 'active', emailVerified: true, emailVerifiedAt: now,
      lastLogin: now, createdAt: now, updatedAt: now,
    };
    account._id = (await db().collection('accounts').insertOne(account)).insertedId;
    const user = {
      accountId: account._id, fullName: pending.fullName, username: pending.email.split('@')[0], phone: pending.phone || null,
      gender: null, dateOfBirth: null, createdAt: now, updatedAt: now,
    };
    try {
      user._id = (await db().collection('users').insertOne(user)).insertedId;
    } catch (error) {
      await db().collection('accounts').deleteOne({ _id: account._id });
      throw error;
    }
    if (pending.newsletter === true) {
      await db().collection('newsletters')
        .updateOne({ email: pending.email }, { $addToSet: { topics: 'news' }, $setOnInsert: { createdAt: now } }, { upsert: true })
        .catch(() => undefined);
    }
    await db().collection('notifications').insertOne({
      userId: user._id, type: 'promo', icon: 'tag', title: 'Chào mừng bạn đến với Lightbook',
      message: 'Cảm ơn bạn đã đăng ký tài khoản. Chúc bạn tìm được những cuốn sách thật hay!',
      read: false, action: { label: 'Khám phá sách', link: '/books' }, createdAt: now,
    });
    return { account, user };
  }

  async function welcomeCoupon() {
    const welcome = await db().collection('vouchers').findOne({ code: WELCOME_CODE, status: 'active' });
    return welcome ? { code: WELCOME_CODE } : null;
  }

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

      const remember = req.body?.remember === true;
      await db().collection('accounts').updateOne({ _id: account._id }, { $set: { failedLogins: 0, lockedUntil: null } });

      // Đúng mật khẩu nhưng còn phải nhập OTP: chưa tạo phiên đăng nhập
      if (account.emailVerificationPending === true) {
        const challenge = await startChallenge(db(), {
          purpose: 'verify_email', accountId: account._id, userId: user._id, email: account.email, remember,
        });
        return res.json({ verificationRequired: true, ...challenge });
      }
      if (user.twoFactorEnabled === true) {
        const challenge = await startChallenge(db(), {
          purpose: 'login_2fa', accountId: account._id, userId: user._id, email: account.email, remember,
        });
        return res.json({ twoFactorRequired: true, ...challenge });
      }

      await db().collection('accounts').updateOne({ _id: account._id }, { $set: { lastLogin: new Date() } });
      const { token } = await createSession(db(), { accountId: account._id, userId: user._id, remember });
      res.json({ token, user: publicUser(account, user) });
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  // Nhập mã OTP sau khi đăng ký (verify_email) hoặc khi đăng nhập có xác thực 2 lớp (login_2fa)
  router.post('/auth/otp/verify', async (req, res, next) => {
    try {
      const challenge = await consumeChallenge(db(), {
        challengeId: req.body?.challengeId, code: req.body?.code, purposes: ['register', 'verify_email', 'login_2fa'],
      });

      // Đăng ký mới: email đã được xác minh → bây giờ mới tạo tài khoản
      if (challenge.purpose === 'register') {
        const pending = challenge.pending;
        await db().collection(OTP_COLLECTION).updateOne({ _id: challenge._id }, { $unset: { pending: '' } });
        if (!pending?.email || !pending.passwordHash) {
          return res.status(410).json({ message: 'Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.', code: 'OTP_SESSION_EXPIRED' });
        }
        // Có người vừa đăng ký trước bằng email / SĐT này trong lúc chờ nhập mã
        const taken = await takenBy(db(), pending);
        if (taken) return res.status(409).json(TAKEN[taken]);
        const { account, user } = await createCustomer(pending, new Date());
        const { token } = await createSession(db(), { accountId: account._id, userId: user._id, remember: challenge.remember === true });
        return res.json({ token, user: publicUser(account, user), coupon: await welcomeCoupon() });
      }
      const account = await db().collection('accounts').findOne({ _id: challenge.accountId });
      const user = account ? await db().collection('users').findOne({ accountId: account._id }) : null;
      if (!account || !user || account.roleCode !== 'CUSTOMER') {
        return res.status(410).json({ message: 'Tài khoản không còn tồn tại.', code: 'OTP_SESSION_EXPIRED' });
      }
      if (account.status !== 'active') return res.status(403).json({ message: 'Tài khoản đang bị khoá, vui lòng liên hệ Lightbook' });

      const now = new Date();
      const verifying = challenge.purpose === 'verify_email';
      await db().collection('accounts').updateOne(
        { _id: account._id },
        verifying
          ? { $set: { emailVerified: true, emailVerifiedAt: now, lastLogin: now, updatedAt: now }, $unset: { emailVerificationPending: '' } }
          : { $set: { lastLogin: now } },
      );
      const { token } = await createSession(db(), { accountId: account._id, userId: user._id, remember: challenge.remember === true });
      const body = { token, user: publicUser(account, user) };
      if (verifying) body.coupon = await welcomeCoupon();
      res.json(body);
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  router.post('/auth/otp/resend', async (req, res, next) => {
    try {
      res.json(await resendChallenge(db(), req.body?.challengeId));
    } catch (error) {
      otpFailure(res, next, error);
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

  // Gửi OTP đặt lại mật khẩu. Email chưa đăng ký vẫn trả 200 giống hệt (mã giả, không gửi)
  // để người ngoài không dò được email nào có tài khoản.
  router.post('/auth/forgot-password', async (req, res, next) => {
    try {
      const email = text(req.body?.email).toLowerCase();
      if (!EMAIL_PATTERN.test(email) || email.length > 254) return res.status(400).json({ message: 'Email không hợp lệ', field: 'email' });
      const account = await db().collection('accounts').findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
      const user = account ? await db().collection('users').findOne({ accountId: account._id }) : null;
      const real = account && user && account.roleCode === 'CUSTOMER' && account.status === 'active';
      const challenge = await startChallenge(db(), real
        ? { purpose: 'reset_password', accountId: account._id, userId: user._id, email: account.email }
        : { purpose: 'reset_password', accountId: null, email });
      res.json({ deliveryAvailable: true, ...challenge });
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  router.post('/auth/reset-password', async (req, res, next) => {
    try {
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (weakPassword(newPassword)) {
        return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 8 ký tự, có cả chữ và số', field: 'newPassword' });
      }
      const challenge = await consumeChallenge(db(), {
        challengeId: req.body?.challengeId, code: req.body?.code, purposes: ['reset_password'],
      });
      const account = await db().collection('accounts').findOne({ _id: challenge.accountId });
      if (!account || account.roleCode !== 'CUSTOMER') {
        return res.status(410).json({ message: 'Tài khoản không còn tồn tại.', code: 'OTP_SESSION_EXPIRED' });
      }
      const now = new Date();
      await db().collection('accounts').updateOne(
        { _id: account._id },
        {
          // Nhận được mã qua email cũng là đã chứng minh sở hữu email
          $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now, failedLogins: 0, lockedUntil: null, emailVerified: true, updatedAt: now },
          $unset: { emailVerificationPending: '' },
        },
      );
      // Đăng xuất mọi thiết bị đang dùng mật khẩu cũ
      await db().collection('customer_sessions').deleteMany({ accountId: account._id });
      res.json({ message: 'Đã đặt lại mật khẩu. Bạn đăng nhập bằng mật khẩu mới nhé.', passwordChangedAt: now.toISOString() });
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  return router;
};

module.exports.publicUser = publicUser;
