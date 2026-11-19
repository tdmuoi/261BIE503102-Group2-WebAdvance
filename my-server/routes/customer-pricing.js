// =====================================================================
// Tính tiền đơn hàng cho web khách hàng (dùng chung cho POST /api/orders và POST /api/vouchers/apply).
// =====================================================================

const FREESHIP_MIN = 500000;
const SHIPPING_FEES = { standard: 30000, express: 45000 };

function voucherKind(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'percent' || t === 'percentage') return 'percent';
  if (t === 'fixed' || t === 'amount') return 'fixed';
  if (t === 'free_shipping' || t === 'shipping' || t === 'freeship') return 'freeship';
  return null;
}

function voucherProblem(voucher, now = new Date(), usedByUser = 0) {
  if (!voucher || voucherKind(voucher.type) === null) return 'Mã giảm giá không hợp lệ hoặc đã hết hạn';
  if (voucher.isDemo === true ||
      (voucher.usedCount != null && (!Number.isSafeInteger(voucher.usedCount) || voucher.usedCount < 0 || voucher.usedCount >= Number.MAX_SAFE_INTEGER)) ||
      ['usageLimit', 'perUserLimit'].some((key) => voucher[key] != null && (!Number.isSafeInteger(voucher[key]) || voucher[key] < 1)) ||
      ['startAt', 'endAt'].some((key) => voucher[key] != null && !Number.isFinite(new Date(voucher[key]).getTime())) ||
      ['minOrderValue', 'maxDiscount'].some((key) => voucher[key] != null && (!Number.isSafeInteger(voucher[key]) || voucher[key] < 0)) ||
      (voucherKind(voucher.type) !== 'freeship' && (!Number.isFinite(voucher.value) || voucher.value <= 0 ||
        (voucherKind(voucher.type) === 'percent' ? voucher.value > 100 : !Number.isSafeInteger(voucher.value)))))
    return 'Cấu hình mã giảm giá chưa hợp lệ';
  if (voucher.status && voucher.status !== 'active') return 'Mã giảm giá không hợp lệ hoặc đã hết hạn';
  if (voucher.startAt && new Date(voucher.startAt) > now) return 'Mã giảm giá chưa đến thời gian sử dụng';
  if (voucher.endAt && new Date(voucher.endAt) < now) return 'Mã giảm giá đã hết hạn';
  if (Number.isFinite(voucher.usageLimit) && (voucher.usedCount ?? 0) >= voucher.usageLimit) return 'Mã giảm giá đã hết lượt sử dụng';
  if (Number.isFinite(voucher.perUserLimit) && voucher.perUserLimit > 0 && usedByUser >= voucher.perUserLimit) {
    return 'Bạn đã dùng hết lượt cho mã này';
  }
  return null;
}

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

function computeTotals(lines, { method = 'standard', voucher = null, shipping = null } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const physical = lines.filter((l) => !l.ebook);
  const physicalSubtotal = physical.reduce((s, l) => s + l.price * l.quantity, 0);
  const hasPhysical = physical.length > 0;
  const shipMethod = hasPhysical ? (method === 'express' ? 'express' : 'standard') : null;

  const comboDiscount = 0;

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
    shipMethod === 'standard' && (voucherFreeship || physicalSubtotal >= (shipping?.freeShippingThreshold ?? FREESHIP_MIN));
  const shippingFee = !shipMethod || freeship ? 0 : shipMethod === 'standard'
    ? shipping?.standardFee ?? SHIPPING_FEES.standard : shipping?.expressFee ?? SHIPPING_FEES.express;

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
