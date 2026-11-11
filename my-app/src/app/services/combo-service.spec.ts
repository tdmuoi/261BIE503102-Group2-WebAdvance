import { TestBed } from '@angular/core/testing';

import { computeTotals } from '../Pages/cart/pricing';
import { ComboService, comboPrice } from './combo-service';

describe('ComboService', () => {
  let service: ComboService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(ComboService);
  });

  const line = (bookId: string, price: number, quantity = 1) => ({ bookId, price, quantity });

  it('giá combo = tổng giá bán giảm 10%, làm tròn nghìn', () => {
    expect(comboPrice(100000 + 86000)).toBe(167000);
  });

  it('đủ sách trong combo mới được giảm, thiếu 1 cuốn thì không', () => {
    service.add({ name: 'Tự chọn', bookIds: ['a', 'b', 'c'], freeship: true });

    const full = service.discountFor([line('a', 100000), line('b', 50000), line('c', 50000), line('x', 90000)]);
    expect(full.amount).toBe(200000 - comboPrice(200000));
    expect(full.freeship).toBe(true);
    expect(full.labels.get('a')).toBe('Tự chọn');
    expect(full.labels.has('x')).toBe(false);

    const missing = service.discountFor([line('a', 100000), line('b', 50000)]);
    expect(missing).toMatchObject({ amount: 0, freeship: false });
  });

  it('chỉ giảm 1 bản mỗi cuốn dù mua nhiều', () => {
    service.add({ name: 'Bộ đôi', bookIds: ['a', 'b'], freeship: false });
    expect(service.discountFor([line('a', 100000, 3), line('b', 100000)]).amount).toBe(20000);
  });

  it('combo mới trùng sách thay combo cũ; xoá sách thì gỡ combo', () => {
    service.add({ name: 'Cũ', bookIds: ['a', 'b'], freeship: false });
    service.add({ name: 'Mới', bookIds: ['b', 'c'], freeship: false });
    expect(service.combos().map((c) => c.name)).toEqual(['Mới']);

    service.removeBooks(['c']);
    expect(service.combos()).toEqual([]);
  });

  it('computeTotals trừ combo trước, mã giảm giá tính trên phần còn lại, combo tự chọn freeship', () => {
    const totals = computeTotals(
      [{ price: 100000, quantity: 1, ebook: false }, { price: 100000, quantity: 1, ebook: false }],
      { code: 'LIGHTBOOK10', type: 'percent', value: 10, maxDiscount: null, minOrderValue: 0, description: '' },
      'standard',
      { amount: 20000, freeship: true },
    );
    expect(totals).toMatchObject({ subtotal: 200000, comboDiscount: 20000, discount: 18000, shipping: 0, total: 162000 });
  });
});
