// =====================================================================
// Gửi email cho web khách (hiện dùng cho mã OTP).
// =====================================================================

let transport = null;

function config() {
  const env = process.env;
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return {
      transport: {
        service: 'gmail',
        auth: { user: env.GMAIL_USER.trim(), pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
      },
      from: env.MAIL_FROM || `Lightbook <${env.GMAIL_USER.trim()}>`,
    };
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const port = Number(env.SMTP_PORT) || 587;
    return {
      transport: { host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } },
      from: env.MAIL_FROM || `Lightbook <${env.SMTP_USER}>`,
    };
  }
  return null;
}

function mailConfigured() {
  return config() !== null;
}

async function sendMail({ to, subject, text, html }) {
  const settings = config();
  if (!settings) {
    console.log(`\n[mailer] Chưa cấu hình GMAIL_USER/GMAIL_APP_PASSWORD → không gửi thật.\n  Tới: ${to}\n  Tiêu đề: ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
    return { delivered: false };
  }
  if (!transport) {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch {
      throw new Error('Thiếu thư viện nodemailer — chạy "npm install" trong thư mục my-server rồi khởi động lại server.');
    }
    transport = nodemailer.createTransport(settings.transport);
  }
  await transport.sendMail({ from: settings.from, to, subject, text, html });
  return { delivered: true };
}

async function checkMailer() {
  const settings = config();
  if (!settings) {
    console.log('[mailer] Chế độ THỬ: chưa có GMAIL_USER/GMAIL_APP_PASSWORD trong .env → mã OTP chỉ in ra terminal này, không gửi email.');
    return false;
  }
  const who = settings.transport.auth.user;
  try {
    if (!transport) transport = require('nodemailer').createTransport(settings.transport);
    await transport.verify();
    console.log(`[mailer] Gửi email THẬT qua ${settings.transport.service || settings.transport.host} bằng ${who} — kết nối OK.`);
    return true;
  } catch (error) {
    console.error(`[mailer] Đã cấu hình ${who} nhưng KHÔNG đăng nhập được máy chủ mail: ${error.message}`);
    if (/Invalid login|Username and Password not accepted|535/i.test(error.message)) {
      console.error('[mailer] → GMAIL_APP_PASSWORD sai hoặc đã bị thu hồi. Tạo lại Mật khẩu ứng dụng 16 ký tự cho đúng tài khoản GMAIL_USER.');
    }
    return false;
  }
}

function _setTransportForTest(fake) {
  transport = fake;
}

module.exports = { sendMail, mailConfigured, checkMailer, _setTransportForTest };
