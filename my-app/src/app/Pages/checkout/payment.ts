import { PaymentMethod } from '../../models/account';

/** Thời gian giữ mã thanh toán (giây) */
export const PAYMENT_TTL = 15 * 60;

/**
 * Thông tin nhận tiền của Lightbook.
 * TODO: điền thông tin thật của shop (hoặc lấy từ API cấu hình); khi nối cổng thật,
 * mã QR MoMo/VNPay do backend trả về sau khi tạo đơn (qrImage / payUrl).
 */
export const BANK_INFO = {
  bank: 'Đang cập nhật',
  account: 'Đang cập nhật',
  holder: 'CÔNG TY LIGHTBOOK',
};

export const PAYMENT_GUIDE: Record<Exclude<PaymentMethod, 'cod'>, { title: string; steps: string[] }> = {
  momo: { title: 'Thanh toán bằng Ví MoMo', steps: ['Mở ứng dụng MoMo, chọn “Quét mã”.', 'Quét mã QR bên cạnh.', 'Kiểm tra số tiền và xác nhận thanh toán.'] },
  vnpay: { title: 'Thanh toán qua VNPay', steps: ['Mở ứng dụng ngân hàng hoặc ví có VNPay-QR.', 'Quét mã QR bên cạnh.', 'Kiểm tra số tiền và xác nhận thanh toán.'] },
  bank_transfer: { title: 'Chuyển khoản ngân hàng', steps: ['Chuyển đúng số tiền tới tài khoản bên dưới.', 'Ghi đúng nội dung chuyển khoản để Lightbook đối soát.', 'Đơn được xác nhận trong vài phút sau khi nhận tiền.'] },
};

/** Nội dung chuyển khoản: "LB24215" (bỏ dấu gạch cho ngân hàng dễ đọc) */
export function transferNote(orderCode: string): string {
  return orderCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** "14:59" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Vẽ ô vuông kiểu mã QR từ chuỗi (CHỈ MINH HOẠ, không quét được) — trả về path SVG cho lưới 25×25.
 * Khi có cổng thanh toán thì thay bằng ảnh QR thật do backend trả về.
 */
export function demoQrPath(seed: string, size = 25): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const inFinder = (x: number, y: number) =>
    [[0, 0], [size - 7, 0], [0, size - 7]].some(([fx, fy]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7);
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inFinder(x, y) && rand() > 0.5) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  // 3 ô định vị ở góc
  for (const [fx, fy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    d += `M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}v5h5v-5zM${fx + 2} ${fy + 2}h3v3h-3z`;
  }
  return d;
}
