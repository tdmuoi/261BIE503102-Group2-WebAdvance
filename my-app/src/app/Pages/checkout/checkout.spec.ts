import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CatalogBook } from '../../models/book';
import { VndPipe } from '../../pipes/vnd-pipe';
import { BookService } from '../../services/book-service';
import { CartService } from '../../services/cart-service';
import { FakeDb, fakeCustomerApi, signInForTest } from '../../testing/fake-customer-api';
import { Checkout } from './checkout';

const book = (id: string, price: number, type: 'new' | 'ebook' = 'new') =>
  ({ _id: id, title: `Sách ${id}`, image: `${id}.jpg`, price, originalPrice: price, discountPercent: 0, stock: 10, type, authorName: 'Tác giả', createdAt: '2026-01-01' }) as CatalogBook;

describe('Checkout', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;
  let el: HTMLElement;
  let db: FakeDb;

  async function setup(items: { bookId: string; price: number; quantity: number }[]) {
    localStorage.clear();
    sessionStorage.clear();
    signInForTest();
    const api = fakeCustomerApi();
    db = api.db;
    localStorage.setItem('lightbook.cart', JSON.stringify(items.map((i) => ({ ...i, title: i.bookId, image: '' }))));
    await TestBed.configureTestingModule({
      declarations: [Checkout, VndPipe],
      imports: [RouterModule],
      providers: [
        provideRouter([]),
        api.providers,
        { provide: BookService, useValue: { getCatalog: () => of({ books: [book('a', 240000), book('b', 99000), book('e', 65000, 'ebook')], authors: [], categories: [] }) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    vi.useFakeTimers();
    fixture.detectChanges();
    vi.advanceTimersByTime(400); // sổ địa chỉ
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('đơn có sách giấy: đủ 4 bước, chọn sẵn địa chỉ mặc định, tính phí ship', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    expect(el.querySelectorAll('.card').length).toBe(4);
    expect(component.addressId()).toBe('addr-1');
    expect(component.totals()).toMatchObject({ subtotal: 99000, shipping: 30000, total: 129000 });
    component.shipping.set('express');
    expect(component.totals().shipping).toBe(45000);
  });

  it('đơn chỉ có ebook: bỏ bước địa chỉ + vận chuyển, không có COD, phí ship 0', async () => {
    await setup([{ bookId: 'e', price: 65000, quantity: 1 }]);
    expect(el.textContent).not.toContain('Thông tin nhận hàng');
    expect(el.textContent).not.toContain('Phương thức vận chuyển');
    expect(component.paymentOptions().map((o) => o.value)).not.toContain('cod');
    expect(component.totals()).toMatchObject({ shipping: 0, total: 65000 });
  });

  it('đơn có cả ebook thì không chọn được COD', async () => {
    await setup([{ bookId: 'a', price: 240000, quantity: 1 }, { bookId: 'e', price: 65000, quantity: 1 }]);
    component.selectPayment('cod');
    expect(component.payment()).toBe('momo');
  });

  it('Ví MoMo: đặt hàng mở bước quét mã; bấm "Tôi đã thanh toán" thì xong, xoá sách khỏi giỏ', async () => {
    await setup([{ bookId: 'a', price: 240000, quantity: 2 }, { bookId: 'e', price: 65000, quantity: 1 }]);
    component.placeOrder();
    vi.advanceTimersByTime(800);
    fixture.detectChanges();
    const pending = component.paying()!;
    expect(pending.orderCode).toBe('LB-26117');
    expect(pending.paymentStatus).toBe('unpaid');
    expect(el.querySelector('.pay-modal')?.textContent).toContain('LB26117');
    expect(db.calls).toContain('POST /orders');
    expect(TestBed.inject(CartService).items().length).toBe(2); // chưa trả tiền thì giỏ còn nguyên
    component.confirmPaid();
    vi.advanceTimersByTime(900);
    fixture.detectChanges();
    const order = component.placed()!;
    expect(order.paymentStatus).toBe('paid');
    expect(db.calls).toContain(`POST /orders/${order._id}/confirm-payment`);
    expect(el.textContent).toContain('Đặt hàng thành công');
    expect(el.textContent).toContain('Sách điện tử trong đơn đã có trong tủ sách của bạn.');
    expect(TestBed.inject(CartService).items().length).toBe(0);
    expect(db.orders[0].orderCode).toBe('LB-26117');
  });

  it('huỷ bước quét mã: đơn bị huỷ, giỏ giữ nguyên; COD thì xong luôn không cần quét mã', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    component.payment.set('bank_transfer');
    component.placeOrder();
    vi.advanceTimersByTime(800);
    fixture.detectChanges();
    expect(el.querySelector('.pay-modal')?.textContent).toContain('Số tài khoản');
    component.cancelPayment();
    vi.advanceTimersByTime(500);
    expect(component.paying()).toBeNull();
    expect(TestBed.inject(CartService).items().length).toBe(1);

    component.payment.set('cod');
    component.placeOrder();
    vi.advanceTimersByTime(800);
    expect(component.paying()).toBeNull();
    expect(component.placed()?.paymentMethod).toBe('cod');
  });

  it('hết 15 phút chưa thanh toán thì tự huỷ', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    component.placeOrder();
    vi.advanceTimersByTime(800);
    expect(component.countdown()).toBe('15:00');
    vi.advanceTimersByTime(15 * 60 * 1000 + 600);
    expect(component.paying()).toBeNull();
  });

  it('tổng tiền trước khi đặt: 480.000 + 65.000 + ship 30.000 (freeship chỉ tính trên sách giấy)', async () => {
    await setup([{ bookId: 'a', price: 240000, quantity: 2 }, { bookId: 'e', price: 65000, quantity: 1 }]);
    expect(component.totals().total).toBe(575000);
  });

  it('giỏ không có sách được chọn thì báo và dẫn về giỏ hàng', async () => {
    await setup([]);
    expect(el.textContent).toContain('Chưa có sách nào để thanh toán');
  });
});
