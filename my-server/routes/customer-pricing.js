// =====================================================================
// Tính tiền đơn hàng cho web khách hàng (dùng chung cho POST /api/orders và POST /api/vouchers/apply).
// Hàm thuần, không đụng database — giá sách và mã giảm giá được route đọc từ DB rồi truyền vào.
// Quy tắc khớp với my-app/src/app/Pages/cart/pricing.ts:
//   - Freeship giao tiêu chuẩn khi tiền sách giấy >= 500.000đ, giao nhanh luôn tính phí
//   - Combo đủ sách: giảm 10% (làm tròn nghìn), combo tự chọn được freeship giao tiêu chuẩn
//   - Mã giảm giá tính trên số tiền sau khi trừ combo
// =====================================================================

const FREESHIP_MIN = 500000;
const SHIPPING_FEES = { standard: 30000, express: 45000 };
const COMBO_EXTRA_DISCOUNT = 0.1;

/** Dữ liệu cũ đặt tên loại mã khác nhau: percent/percentage, fixed/amount, free_shipping/shipping */
function voucherKind(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'percent' || t === 'percentage') return 'percent';
  if (t === 'fixed' || t === 'amount') return 'fixed';
  if (t === 'free_shipping' || t === 'shipping' || t === 'freeship') return 'freeship';
  return null;
}

function comboPrice(sale) {
  return Math.round((sale * (1 - COMBO_EXTRA_DISCOUNT)) / 1000) * 1000;
}

/**
 * Kiểm tra mã còn dùng được không (chưa xét đơn tối thiểu).
 * usedByUser: số đơn (chưa huỷ) người này đã dùng mã.
 */
function voucherProblem(voucher, now = new Date(), usedByUser = 0) {
  if (!voucher || voucherKind(voucher.type) === null) return 'Mã giảm giá không hợp lệ hoặc đã hết hạn';
  if (voucher.status && voucher.status !== 'active') return 'Mã giảm giá không hợp lệ hoặc đã hết hạn';
  if (voucher.startAt && new Date(voucher.startAt) > now) return 'Mã giảm giá chưa đến thời gian sử dụng';
  if (voucher.endAt && new Date(voucher.endAt) < now) return 'Mã giảm giá đã hết hạn';
  if (Number.isFinite(voucher.usageLimit) && (voucher.usedCount ?? 0) >= voucher.usageLimit) return 'Mã giảm giá đã hết lượt sử dụng';
  if (Number.isFinite(voucher.perUserLimit) && voucher.perUserLimit > 0 && usedByUser >= voucher.perUserLimit) {
    return 'Bạn đã dùng hết lượt cho mã này';
  }
  return null;
}

/** Thông tin mã gửi cho trang (không lộ usageLimit/usedCount) */
function publicVoucher(voucher) {
  const kind = voucherKind(voucher.type);
  const value = Number(voucher.value) || 0;
  const description =
    voucher.description ||
    (kind === 'percent' ? `giảm ${value}%` : kind === 'fixed' ? `giảm ${value.toLocaleString('vi-VN')}đ` : 'miễn phí vận chuyển');
  return {
    code: String(voucher.code).toUpperCase(),
    type: kind,
    value,
    maxDiscount: Number(voucher.maxDiscount) || null,
    minOrderValue: Number(voucher.minOrderValue) || 0,
    description,
  };
}

/**
 * lines: [{ bookId, price, quantity, ebook }]
 * combos: [{ bookIds: string[], freeship?: boolean }] — combo trang gửi lên, chỉ tính khi đủ sách trong đơn
 * voucher: document trong collection vouchers (đã kiểm tra voucherProblem) hoặc null
 */
function computeTotals(lines, { method = 'standard', combos = [], voucher = null } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const physical = lines.filter((l) => !l.ebook);
  const physicalSubtotal = physical.reduce((s, l) => s + l.price * l.quantity, 0);
  const hasPhysical = physical.length > 0;
  const shipMethod = hasPhysical ? (method === 'express' ? 'express' : 'standard') : null;

  // Combo: mỗi cuốn chỉ tính trong một combo
  const byId = new Map(lines.map((l) => [String(l.bookId), l]));
  const used = new Set();
  let comboDiscount = 0;
  let comboFreeship = false;
  for (const combo of Array.isArray(combos) ? combos.slice(0, 20) : []) {
    const ids = [...new Set((combo?.bookIds || []).map(String))];
    if (ids.length < 2 || ids.some((id) => !byId.has(id) || used.has(id))) continue;
    const sale = ids.reduce((s, id) => s + byId.get(id).price, 0);
    comboDiscount += Math.max(0, sale - comboPrice(sale));
    comboFreeship ||= !!combo.freeship;
    ids.forEach((id) => used.add(id));
  }
  comboDiscount = Math.min(comboDiscount, subtotal);

  const kind = voucher ? voucherKind(voucher.type) : null;
  const base = subtotal - comboDiscount;
  let voucherError = null;
  let discount = 0;
  if (voucher && base < (Number(voucher.minOrderValue) || 0)) {
    voucherError = `Mã chỉ áp dụng cho đơn từ ${Number(voucher.minOrderValue).toLocaleString('vi-VN')}đ`;
  } else if (kind === 'percent') {
    discount = Math.round((base * (Number(voucher.value) || 0)) / 100);
    if (Number(voucher.maxDiscount) > 0) discount = Math.min(discount, Number(voucher.maxDiscount));
  } else if (kind === 'fixed') {
    discount = Math.min(Number(voucher.value) || 0, base);
  }

  const voucherFreeship = !voucherError && kind === 'freeship';
  const freeship =
    shipMethod === 'standard' && (comboFreeship || voucherFreeship || physicalSubtotal >= FREESHIP_MIN);
  const shippingFee = !shipMethod || freeship ? 0 : SHIPPING_FEES[shipMethod];

  return {
    subtotal,
    comboDiscount,
    discount,
    shippingFee,
    shippingMethod: shipMethod,
    total: Math.max(0, subtotal - comboDiscount - discount + shippingFee),
    hasPhysical,
    voucherError,
  };
}

module.exports = { FREESHIP_MIN, SHIPPING_FEES, voucherKind, voucherProblem, publicVoucher, computeTotals };
