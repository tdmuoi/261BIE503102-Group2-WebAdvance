// Chạy: node --test routes/customer-pricing.test.js   (trong thư mục my-server)
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTotals, voucherProblem, voucherKind, publicVoucher } = require('./customer-pricing');

const print = (bookId, price, quantity = 1) => ({ bookId, price, quantity, ebook: false });
const ebook = (bookId, price) => ({ bookId, price, quantity: 1, ebook: true });

test('phí ship: dưới 500k tính 30k, từ 500k freeship, giao nhanh luôn 45k', () => {
  assert.equal(computeTotals([print('a', 499000)]).shippingFee, 30000);
  assert.equal(computeTotals([print('a', 250000, 2)]).shippingFee, 0);
  assert.equal(computeTotals([print('a', 600000)], { method: 'express' }).shippingFee, 45000);
});

test('đơn chỉ có ebook không có phí ship', () => {
  const t = computeTotals([ebook('e', 65000)], { method: 'express' });
  assert.equal(t.shippingFee, 0); assert.equal(t.shippingMethod, null); assert.equal(t.total, 65000);
});

test('mã phần trăm có trần giảm tối đa', () => {
  const t = computeTotals([print('a', 400000)], { voucher: { type: 'percentage', value: 20, maxDiscount: 50000 } });
  assert.equal(t.discount, 50000); assert.equal(t.total, 400000 - 50000 + 30000);
});

test('mã cố định không vượt quá tiền hàng và cần đơn tối thiểu', () => {
  assert.equal(computeTotals([print('a', 30000)], { voucher: { type: 'fixed', value: 50000 } }).discount, 30000);
  const t = computeTotals([print('a', 100000)], { voucher: { type: 'fixed', value: 50000, minOrderValue: 300000 } });
  assert.equal(t.discount, 0); assert.match(t.voucherError, /300\.000/);
});

test('mã freeship chỉ miễn phí giao tiêu chuẩn', () => {
  const v = { type: 'free_shipping' };
  assert.equal(computeTotals([print('a', 100000)], { voucher: v }).shippingFee, 0);
  assert.equal(computeTotals([print('a', 100000)], { voucher: v, method: 'express' }).shippingFee, 45000);
});

test('combo đủ sách giảm 10% (làm tròn nghìn), thiếu sách thì không tính', () => {
  const lines = [print('a', 120000), print('b', 95000)];
  const t = computeTotals(lines, { combos: [{ bookIds: ['a', 'b'] }] });
  assert.equal(t.comboDiscount, 215000 - 194000);
  assert.equal(computeTotals(lines, { combos: [{ bookIds: ['a', 'c'] }] }).comboDiscount, 0);
});

test('kiểm tra mã: hết hạn, chưa tới ngày, hết lượt, sai loại', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  assert.equal(voucherProblem({ type: 'fixed', status: 'active' }, now), null);
  assert.match(voucherProblem({ type: 'fixed', endAt: '2026-01-01' }, now), /hết hạn/);
  assert.match(voucherProblem({ type: 'fixed', startAt: '2027-01-01' }, now), /chưa đến/);
  assert.match(voucherProblem({ type: 'fixed', usageLimit: 5, usedCount: 5 }, now), /hết lượt/);
  assert.match(voucherProblem({ type: 'fixed', perUserLimit: 1 }, now, 1), /hết lượt/);
  assert.ok(voucherProblem({ type: 'bogus' }, now));
  assert.equal(voucherKind('PERCENT'), 'percent');
});

test('publicVoucher không trả usageLimit/usedCount', () => {
  const v = publicVoucher({ code: 'abc', type: 'percent', value: 10, usageLimit: 9, usedCount: 2 });
  assert.equal(v.code, 'ABC'); assert.equal(v.description, 'giảm 10%'); assert.equal('usedCount' in v, false);
});
