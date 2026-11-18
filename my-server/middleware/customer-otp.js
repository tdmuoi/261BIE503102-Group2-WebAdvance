// =====================================================================
// Mã OTP 6 số gửi qua email cho web khách hàng.
//   verify_email   — xác minh email sau khi đăng ký
//   login_2fa      — xác thực 2 lớp khi đăng nhập (khách bật trong hồ sơ)
//   reset_password — quên mật khẩu
//
// Collection otp (tự xoá 1 giờ sau khi hết hạn — TTL index):
//   { challengeId, purpose, accountId, userId, email, remember, codeHash, attempts,
//     sendCount, lastSentAt, expiresAt, consumedAt, createdAt }
// Database chỉ lưu SHA-256 của mã, không lưu mã gốc. challengeId là chuỗi ngẫu nhiên
// trả cho trang để gửi kèm khi nhập mã; một mã chỉ dùng được một lần.
// =====================================================================
const { randomBytes, randomInt, timingSafeEqual } = require('node:crypto');
const { digest } = require('./customer-auth');
const { sendMail } = require('./mailer');

const COLLECTION = 'otp';
const CODE_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;

const PURPOSES = {
  verify_email: { subject: 'Mã xác minh email Lightbook', action: 'xác minh email cho tài khoản Lightbook mới của bạn' },
  login_2fa: { subject: 'Mã đăng nhập Lightbook', action: 'đăng nhập vào tài khoản Lightbook (xác thực 2 lớp)' },
  reset_password: { subject: 'Mã đặt lại mật khẩu Lightbook', action: 'đặt lại mật khẩu tài khoản Lightbook' },
};

class OtpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.body = { message, ...extra };
  }
}

let indexesReady = null;
function ensureIndexes(db) {
  indexesReady ??= require('./prepare-data-flows').prepareOtpStorage(db).catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
}

/** hangnmkk24406h@st.uel.edu.vn → ha***********h@st.uel.edu.vn */
function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return '';
  if (name.length <= 2) return `${name[0] || ''}*@${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 3))}${name.slice(-1)}@${domain}`;
}

const newCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
const hashCode = (challengeId, code) => digest(`${challengeId}:${code}`);

async function deliver(email, code, purpose) {
  const { subject, action } = PURPOSES[purpose];
  const text =
    `Mã OTP của bạn là: ${code}\n\n` +
    `Bạn dùng mã này để ${action}. Mã có hiệu lực trong ${CODE_MINUTES} phút và chỉ dùng được một lần.\n` +
    'Nếu bạn không yêu cầu mã này, hãy bỏ qua email. Lightbook không bao giờ hỏi mã OTP qua điện thoại hay tin nhắn.';
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1f2a2a">
  <h2 style="margin:0 0 12px">Lightbook</h2>
  <p>Bạn dùng mã dưới đây để ${action}.</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#fdf3c7;border-radius:12px;padding:16px;text-align:center;margin:16px 0">${code}</p>
  <p>Mã có hiệu lực trong <b>${CODE_MINUTES} phút</b> và chỉ dùng được một lần.</p>
  <p style="color:#6b7272;font-size:13px">Nếu bạn không yêu cầu mã này, hãy bỏ qua email. Lightbook không bao giờ hỏi mã OTP qua điện thoại hay tin nhắn.</p>
</div>`;
  try {
    return await sendMail({ to: email, subject: `${subject}: ${code}`, text, html });
  } catch (error) {
    console.error('[otp] Gửi email thất bại:', error.message);
    throw new OtpError(502, 'Chưa gửi được email chứa mã OTP. Vui lòng thử lại sau ít phút.');
  }
}

function publicChallenge(doc, resendAfter = RESEND_SECONDS) {
  return {
    challengeId: doc.challengeId,
    purpose: doc.purpose,
    email: maskEmail(doc.email),
    resendAfter,
    expiresIn: Math.max(0, Math.round((new Date(doc.expiresAt).getTime() - Date.now()) / 1000)),
  };
}

/**
 * Tạo mã mới và gửi email. accountId = null là "mã giả" cho email chưa đăng ký
 * (quên mật khẩu): trả về giống hệt nhưng không gửi gì, để không lộ email nào có tài khoản.
 * Gọi lại trong vòng 60 giây thì dùng lại mã vừa gửi, không gửi thêm.
 */
async function startChallenge(db, { purpose, accountId = null, userId = null, email, remember = false }) {
  if (!PURPOSES[purpose]) throw new Error(`OTP purpose không hợp lệ: ${purpose}`);
  await ensureIndexes(db);
  const col = db.collection(COLLECTION);
  const now = new Date();
  const owner = accountId ? { accountId } : { accountId: null, email };

  const recent = await col.findOne({ ...owner, purpose, consumedAt: null, expiresAt: { $gt: now } });
  if (recent) {
    const wait = RESEND_SECONDS - Math.floor((now.getTime() - new Date(recent.lastSentAt).getTime()) / 1000);
    if (wait > 0) {
      if (recent.remember !== remember) await col.updateOne({ _id: recent._id }, { $set: { remember } });
      return publicChallenge(recent, wait);
    }
  }
  // Mã cũ chưa dùng của cùng mục đích bị vô hiệu, chỉ mã mới nhất có tác dụng
  await col.updateMany({ ...owner, purpose, consumedAt: null }, { $set: { consumedAt: now, replaced: true } });

  const challengeId = randomBytes(24).toString('hex');
  const code = newCode();
  const doc = {
    challengeId, purpose, accountId, userId, email, remember: remember === true,
    codeHash: hashCode(challengeId, code),
    attempts: 0, sendCount: 1, lastSentAt: now,
    expiresAt: new Date(now.getTime() + CODE_MINUTES * 60 * 1000),
    consumedAt: null, createdAt: now,
  };
  doc._id = (await col.insertOne(doc)).insertedId;
  if (accountId) {
    try {
      await deliver(email, code, purpose);
    } catch (error) {
      await col.deleteOne({ _id: doc._id });
      throw error;
    }
  }
  return publicChallenge(doc);
}

/** Gửi lại mã mới cho cùng challengeId (chờ 60 giây giữa 2 lần, tối đa 5 lần gửi) */
async function resendChallenge(db, challengeId) {
  await ensureIndexes(db);
  const col = db.collection(COLLECTION);
  const doc = typeof challengeId === 'string' && /^[a-f\d]{48}$/.test(challengeId)
    ? await col.findOne({ challengeId })
    : null;
  if (!doc || doc.consumedAt) {
    throw new OtpError(410, 'Phiên xác thực đã hết hạn. Vui lòng thực hiện lại từ đầu.', { code: 'OTP_SESSION_EXPIRED' });
  }
  const now = new Date();
  const wait = RESEND_SECONDS - Math.floor((now.getTime() - new Date(doc.lastSentAt).getTime()) / 1000);
  if (wait > 0) throw new OtpError(429, `Vui lòng chờ ${wait} giây rồi gửi lại mã.`, { retryAfter: wait });
  if (doc.sendCount >= MAX_SENDS) {
    throw new OtpError(429, 'Bạn đã yêu cầu gửi lại quá nhiều lần. Vui lòng thực hiện lại từ đầu sau ít phút.', { code: 'OTP_TOO_MANY_SENDS' });
  }
  const code = newCode();
  const update = {
    codeHash: hashCode(doc.challengeId, code),
    attempts: 0, lastSentAt: now, expiresAt: new Date(now.getTime() + CODE_MINUTES * 60 * 1000),
  };
  if (doc.accountId) await deliver(doc.email, code, doc.purpose);
  await col.updateOne({ _id: doc._id }, { $set: update, $inc: { sendCount: 1 } });
  return publicChallenge({ ...doc, ...update });
}

/** Kiểm tra mã. Đúng thì đánh dấu đã dùng và trả bản ghi; sai thì throw OtpError */
async function consumeChallenge(db, { challengeId, code, purposes }) {
  await ensureIndexes(db);
  const col = db.collection(COLLECTION);
  const expired = () => new OtpError(400, 'Mã OTP đã hết hạn. Bấm "Gửi lại mã" để nhận mã mới.', { code: 'OTP_EXPIRED' });
  const doc = typeof challengeId === 'string' && /^[a-f\d]{48}$/.test(challengeId)
    ? await col.findOne({ challengeId })
    : null;
  if (!doc || !purposes.includes(doc.purpose)) {
    throw new OtpError(410, 'Phiên xác thực đã hết hạn. Vui lòng thực hiện lại từ đầu.', { code: 'OTP_SESSION_EXPIRED' });
  }
  if (doc.consumedAt || new Date(doc.expiresAt) <= new Date()) throw expired();
  if (doc.attempts >= MAX_ATTEMPTS) {
    throw new OtpError(429, `Bạn đã nhập sai ${MAX_ATTEMPTS} lần. Bấm "Gửi lại mã" để nhận mã mới.`, { code: 'OTP_TOO_MANY_ATTEMPTS', remainingAttempts: 0 });
  }
  const value = typeof code === 'string' ? code.trim() : '';
  const expected = doc.accountId && doc.codeHash ? Buffer.from(doc.codeHash, 'hex') : null;
  const given = /^\d{6}$/.test(value) ? Buffer.from(hashCode(doc.challengeId, value), 'hex') : null;
  const ok = !!expected && !!given && expected.length === given.length && timingSafeEqual(expected, given);
  if (!ok) {
    const remaining = Math.max(0, MAX_ATTEMPTS - doc.attempts - 1);
    await col.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw new OtpError(400, remaining > 0 ? `Mã OTP chưa đúng. Bạn còn ${remaining} lần thử.` : `Mã OTP chưa đúng. Bấm "Gửi lại mã" để nhận mã mới.`, {
      code: 'OTP_INVALID',
      remainingAttempts: remaining,
    });
  }
  // Chỉ một request được dùng mã (chống bấm 2 lần / gửi lại cùng mã)
  const claimed = await col.updateOne({ _id: doc._id, consumedAt: null }, { $set: { consumedAt: new Date() } });
  if (claimed.matchedCount !== 1) throw expired();
  return doc;
}

module.exports = {
  OtpError, startChallenge, resendChallenge, consumeChallenge, maskEmail,
  OTP_SETTINGS: { CODE_MINUTES, RESEND_SECONDS, MAX_ATTEMPTS, MAX_SENDS },
  _resetIndexesForTest: () => { indexesReady = null; },
};
