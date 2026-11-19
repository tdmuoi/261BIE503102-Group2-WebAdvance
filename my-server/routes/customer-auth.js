// =====================================================================
// Đăng ký / đăng nhập cho web khách hàng
// =====================================================================
const express = require('express');
const { randomBytes } = require('node:crypto');
const { hashPassword, verifyPassword, createSession, deleteSession, requireCustomer, digest } = require('../middleware/customer-auth');
const { OtpError, startChallenge, resendChallenge, consumeChallenge, OTP_COLLECTION } = require('../middleware/customer-otp');
const { PROVIDERS, OAuthError, clientUrl, redirectUri } = require('../middleware/oauth-providers');

const OAUTH_COLLECTION = 'oauth_states';
const OAUTH_STATE_MINUTES = 10;
const OAUTH_RESULT_MINUTES = 2;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^0\d{9}$/;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const WELCOME_CODE = 'WELCOME10';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const weakPassword = (p) => p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p) || Buffer.byteLength(p) > 72;

function otpFailure(res, next, error) {
  if (error instanceof OtpError) return res.status(error.status).json(error.body);
  return next(error);
}

function publicUser(account, user) {
  return { _id: String(user._id), fullName: user.fullName || '', email: account.email, phone: user.phone || null, avatar: user.avatar || null };
}

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

      const pending = {
        fullName, email, phone, passwordHash: await hashPassword(password), newsletter: req.body?.newsletter === true,
      };
      const challenge = await startChallenge(db(), { purpose: 'register', email, remember: true, pending });
      res.status(201).json({ verificationRequired: true, ...challenge });
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  async function createCustomer(pending, now) {
    await removeAbandoned(db(), pending);
    const account = {
      email: pending.email, passwordHash: pending.passwordHash ?? null,
      provider: pending.provider || 'local', providerId: pending.providerId || null,
      roleCode: 'CUSTOMER', status: 'active', emailVerified: true, emailVerifiedAt: now,
      lastLogin: now, createdAt: now, updatedAt: now,
    };
    account._id = (await db().collection('accounts').insertOne(account)).insertedId;
    const user = {
      accountId: account._id, fullName: pending.fullName, username: pending.email.split('@')[0], phone: pending.phone || null,
      gender: null, dateOfBirth: null, createdAt: now, updatedAt: now,
    };
    if (pending.avatar) user.avatar = pending.avatar;
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

  router.post('/auth/otp/verify', async (req, res, next) => {
    try {
      const challenge = await consumeChallenge(db(), {
        challengeId: req.body?.challengeId, code: req.body?.code, purposes: ['register', 'verify_email', 'login_2fa'],
      });

      if (challenge.purpose === 'register') {
        const pending = challenge.pending;
        await db().collection(OTP_COLLECTION).updateOne({ _id: challenge._id }, { $unset: { pending: '' } });
        if (!pending?.email || !pending.passwordHash) {
          return res.status(410).json({ message: 'Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.', code: 'OTP_SESSION_EXPIRED' });
        }
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

  // ---------- Đăng nhập bằng Google / Facebook ----------
  let oauthIndexes = null;
  async function oauthStore() {
    const col = db().collection(OAUTH_COLLECTION);
    oauthIndexes ??= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch((error) => {
      oauthIndexes = null;
      throw error;
    });
    await oauthIndexes;
    return col;
  }

  const providerOf = (name) => (Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : null);
  const safeReturnUrl = (url) =>
    typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && url.length <= 500 ? url : '/';
  const backToClient = (res, params) => res.redirect(`${clientUrl()}/login?${new URLSearchParams(params)}`);

  async function socialLogin(name, profile) {
    const now = new Date();
    const email = profile.email.trim().toLowerCase();
    const accounts = db().collection('accounts');
    const users = db().collection('users');

    let account = await accounts.findOne({ $or: [{ provider: name, providerId: profile.id }, { [`oauth.${name}`]: profile.id }] });
    if (!account) {
      const byEmail = await accounts.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
      if (byEmail && byEmail.emailVerificationPending !== true) account = byEmail;
    }

    let user;
    let created = false;
    if (account) {
      if (account.roleCode !== 'CUSTOMER') throw new OAuthError('Email này thuộc tài khoản quản trị, không dùng để đăng nhập web khách được');
      if (account.status !== 'active') throw new OAuthError('Tài khoản đang bị khoá, vui lòng liên hệ Lightbook');
      user = await users.findOne({ accountId: account._id });
      if (!user) throw new OAuthError('Tài khoản không còn tồn tại');
      const set = { lastLogin: now };
      if (account.provider !== name || account.providerId !== profile.id) set[`oauth.${name}`] = profile.id;
      await accounts.updateOne({ _id: account._id }, { $set: set });
      if (!user.avatar && profile.avatar) {
        await users.updateOne({ _id: user._id }, { $set: { avatar: profile.avatar, updatedAt: now } });
        user.avatar = profile.avatar;
      }
    } else {
      const fullName = (profile.name || email.split('@')[0]).trim().slice(0, 80);
      ({ account, user } = await createCustomer(
        { fullName, email, phone: null, passwordHash: null, provider: name, providerId: profile.id, avatar: profile.avatar },
        now,
      ));
      created = true;
    }

    if (user.twoFactorEnabled === true) {
      const challenge = await startChallenge(db(), {
        purpose: 'login_2fa', accountId: account._id, userId: user._id, email: account.email, remember: true,
      });
      return { twoFactorRequired: true, ...challenge };
    }
    const { token } = await createSession(db(), { accountId: account._id, userId: user._id, remember: true });
    const body = { token, user: publicUser(account, user) };
    if (created) body.coupon = await welcomeCoupon();
    return body;
  }

  router.get('/auth/oauth/:provider/start', async (req, res, next) => {
    try {
      const name = req.params.provider;
      const provider = providerOf(name);
      if (!provider) return res.status(404).json({ message: 'Không hỗ trợ hình thức đăng nhập này' });
      const returnUrl = safeReturnUrl(req.query.returnUrl);
      if (!provider.configured()) {
        return backToClient(res, { oauthError: `Đăng nhập bằng ${provider.label} chưa được cấu hình trên máy chủ`, returnUrl });
      }
      const state = randomBytes(32).toString('hex');
      await (await oauthStore()).insertOne({
        _id: digest(state), kind: 'state', provider: name, returnUrl,
        expiresAt: new Date(Date.now() + OAUTH_STATE_MINUTES * 60 * 1000),
      });
      res.redirect(provider.authorizeUrl({ redirectUri: redirectUri(name), state }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/auth/oauth/:provider/callback', async (req, res) => {
    const name = req.params.provider;
    const provider = providerOf(name);
    if (!provider) return res.status(404).json({ message: 'Không hỗ trợ hình thức đăng nhập này' });
    let returnUrl = '/';
    try {
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const store = await oauthStore();
      const saved = state ? await store.findOneAndDelete({ _id: digest(state), kind: 'state', provider: name }) : null;
      if (!saved || saved.expiresAt < new Date()) throw new OAuthError('Phiên đăng nhập đã hết hạn, bạn bấm đăng nhập lại nhé');
      returnUrl = saved.returnUrl;
      if (req.query.error || typeof req.query.code !== 'string') throw new OAuthError(`Bạn đã huỷ đăng nhập bằng ${provider.label}`);

      const profile = await provider.profile({ code: req.query.code, redirectUri: redirectUri(name) });
      const result = await socialLogin(name, profile);
      const code = randomBytes(32).toString('hex');
      await store.insertOne({
        _id: digest(code), kind: 'result', result,
        expiresAt: new Date(Date.now() + OAUTH_RESULT_MINUTES * 60 * 1000),
      });
      backToClient(res, { oauth: code, returnUrl });
    } catch (error) {
      let message = 'Đăng nhập chưa thành công, bạn thử lại sau nhé';
      if (error instanceof OAuthError) message = error.message;
      else if (error instanceof OtpError) message = error.body?.message || message;
      else console.error(`OAuth ${name} lỗi:`, error.message);
      backToClient(res, { oauthError: message, returnUrl });
    }
  });

  router.post('/auth/oauth/exchange', async (req, res, next) => {
    try {
      const code = typeof req.body?.code === 'string' && /^[a-f\d]{64}$/.test(req.body.code) ? req.body.code : null;
      if (!code) return res.status(400).json({ message: 'Mã đăng nhập không hợp lệ' });
      const saved = await (await oauthStore()).findOneAndDelete({ _id: digest(code), kind: 'result' });
      if (!saved || saved.expiresAt < new Date()) {
        return res.status(410).json({ message: 'Phiên đăng nhập đã hết hạn, bạn đăng nhập lại nhé' });
      }
      res.json(saved.result);
    } catch (error) {
      next(error);
    }
  });

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
          $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now, failedLogins: 0, lockedUntil: null, emailVerified: true, updatedAt: now },
          $unset: { emailVerificationPending: '' },
        },
      );
      await db().collection('customer_sessions').deleteMany({ accountId: account._id });
      res.json({ message: 'Đã đặt lại mật khẩu. Bạn đăng nhập bằng mật khẩu mới nhé.', passwordChangedAt: now.toISOString() });
    } catch (error) {
      otpFailure(res, next, error);
    }
  });

  return router;
};

module.exports.publicUser = publicUser;
