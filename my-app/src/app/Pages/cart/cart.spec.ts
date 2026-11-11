import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CatalogBook } from '../../models/book';
import { BookService } from '../../services/book-service';
import { CartService } from '../../services/cart-service';
import { VndPipe } from '../../pipes/vnd-pipe';
import { Cart } from './cart';
import { computeTotals } from './pricing';
import { provideFakeCustomerApi, signInForTest } from '../../testing/fake-customer-api';

const book = (id: string, price: number, type: 'new' | 'ebook' = 'new') =>
  ({ _id: id, title: `Sách ${id}`, image: `${id}.jpg`, price, originalPrice: price, discountPercent: 0, stock: 10, type, authorName: 'Tác giả', createdAt: '2026-01-01' }) as CatalogBook;

describe('Cart', () => {
  let fixture: ComponentFixture<Cart>;
  let component: Cart;
  let el: HTMLElement;

  async function setup(items: { bookId: string; price: number; quantity: number }[]) {
    localStorage.clear();
    sessionStorage.clear();
    signInForTest();
    localStorage.setItem('lightbook.cart', JSON.stringify(items.map((i) => ({ ...i, title: i.bookId, image: '' }))));
    await TestBed.configureTestingModule({
      declarations: [Cart, VndPipe],
      imports: [RouterModule],
      providers: [
        provideRouter([]),
        provideFakeCustomerApi(),
        { provide: BookService, useValue: { getCatalog: () => of({ books: [book('a', 115000), book('b', 240000), book('e', 65000, 'ebook')], authors: [], categories: [] }) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Cart);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  it('giỏ trống thì hiện "Giỏ hàng trống"', async () => {
    await setup([]);
    expect(el.textContent).toContain('Giỏ hàng trống');
  });

  it('ebook trong giỏ bị đưa về số lượng 1, tối đa 1', async () => {
    await setup([{ bookId: 'e', price: 65000, quantity: 3 }]);
    await fixture.whenStable();
    const line = component.lines()[0];
    expect(line.ebook).toBe(true);
    expect(line.max).toBe(1);
    expect(line.quantity).toBe(1);
    expect(TestBed.inject(CartService).count()).toBe(1);
  });

  it('bỏ chọn thì không tính vào tạm tính; chọn tất cả lại', async () => {
    await setup([{ bookId: 'a', price: 115000, quantity: 2 }, { bookId: 'b', price: 240000, quantity: 1 }]);
    expect(component.totals().subtotal).toBe(470000);
    component.toggle(component.lines()[1]);
    expect(component.totals().subtotal).toBe(230000);
    component.toggleAll();
    expect(component.totals().subtotal).toBe(470000);
  });

  it('đổi số lượng và xoá cập nhật CartService (badge header)', async () => {
    await setup([{ bookId: 'a', price: 115000, quantity: 1 }, { bookId: 'b', price: 240000, quantity: 1 }]);
    const cart = TestBed.inject(CartService);
    component.setQuantity(component.lines()[0], 3);
    expect(cart.quantityOf('a')).toBe(3);
    component.remove(component.lines()[1]);
    expect(cart.items().map((i) => i.bookId)).toEqual(['a']);
  });

  it('mã WELCOME10 giảm 10%, mã sai báo lỗi (kiểm tra qua POST /api/vouchers/apply)', async () => {
    await setup([{ bookId: 'a', price: 115000, quantity: 2 }, { bookId: 'b', price: 240000, quantity: 1 }]);
    vi.useFakeTimers();
    component.voucherInput.set('SAI');
    component.applyVoucher();
    vi.advanceTimersByTime(400);
    expect(component.voucherError()).toBe('Mã giảm giá không hợp lệ hoặc đã hết hạn');
    component.voucherInput.set('WELCOME10');
    component.applyVoucher();
    vi.advanceTimersByTime(400);
    expect(component.totals()).toMatchObject({ subtotal: 470000, discount: 47000, shipping: 30000, total: 453000 });
    vi.useRealTimers();
  });

  it('tính phí: đủ 500.000đ thì freeship, chỉ có ebook thì không tính ship', () => {
    expect(computeTotals([{ price: 500000, quantity: 1, ebook: false }], null).shipping).toBe(0);
    expect(computeTotals([{ price: 500000, quantity: 1, ebook: false }], null, 'express').shipping).toBe(45000);
    expect(computeTotals([{ price: 65000, quantity: 1, ebook: true }], null)).toMatchObject({ shipping: 0, hasPhysical: false });
  });

  it('mã giảm giá: % có trần, giảm tiền cố định, freeship, chưa đạt đơn tối thiểu', () => {
    const lines = [{ price: 400000, quantity: 1, ebook: false }];
    const v = (o: object) => ({ code: 'X', type: 'percent' as const, value: 0, maxDiscount: null, minOrderValue: 0, description: '', ...o });
    expect(computeTotals(lines, v({ value: 20, maxDiscount: 50000 })).discount).toBe(50000);
    expect(computeTotals(lines, v({ type: 'fixed', value: 30000 })).total).toBe(400000 - 30000 + 30000);
    expect(computeTotals(lines, v({ type: 'freeship' })).shipping).toBe(0);
    expect(computeTotals(lines, v({ type: 'freeship' }), 'express').shipping).toBe(45000);
    const short = computeTotals(lines, v({ type: 'fixed', value: 50000, minOrderValue: 500000 }));
    expect(short).toMatchObject({ discount: 0, voucherError: 'Mã chỉ áp dụng cho đơn từ 500.000đ' });
  });
});
