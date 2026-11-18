// =====================================================================
// Gửi email cho web khách (hiện dùng cho mã OTP).
//
// Cấu hình trong my-server/.env (chọn 1 trong 2):
//   GMAIL_USER=tenNhom@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← "Mật khẩu ứng dụng" 16 ký tự của Google,
//                                              KHÔNG phải mật khẩu Gmail thường
//   hoặc SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS cho máy chủ SMTP khác
//   MAIL_FROM="Lightbook <tenNhom@gmail.com>"   (không bắt buộc)
//
// Chưa cấu hình gì → chế độ thử: không gửi thật, in nội dung email ra terminal của server
// để nhóm vẫn chạy thử được các luồng OTP trên máy mình.
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

/** true khi đã cấu hình Gmail/SMTP (gửi thật) */
function mailConfigured() {
  return config() !== null;
}

/**
 * Gửi email. Trả { delivered: true } khi gửi thật, { delivered: false } ở chế độ thử.
 * Lỗi SMTP (sai mật khẩu ứng dụng, mất mạng…) sẽ throw để route báo lại cho khách.
 */
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

/** Cho test thay transport giả */
function _setTransportForTest(fake) {
  transport = fake;
}

module.exports = { sendMail, mailConfigured, _setTransportForTest };
