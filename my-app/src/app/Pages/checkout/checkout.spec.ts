import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CatalogBook } from '../../models/book';
import { VndPipe } from '../../pipes/vnd-pipe';
import { BookService } from '../../services/book-service';
import { CartService } from '../../services/cart-service';
import { mockGetOrders, resetMockOrders } from '../account/orders/orders.mock';
import { Checkout } from './checkout';

const book = (id: string, price: number, type: 'new' | 'ebook' = 'new') =>
  ({ _id: id, title: `Sách ${id}`, image: `${id}.jpg`, price, originalPrice: price, discountPercent: 0, stock: 10, type, authorName: 'Tác giả', createdAt: '2026-01-01' }) as CatalogBook;

describe('Checkout', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;
  let el: HTMLElement;

  async function setup(items: { bookId: string; price: number; quantity: number }[]) {
    localStorage.clear();
    sessionStorage.clear();
    resetMockOrders();
    localStorage.setItem('lightbook.cart', JSON.stringify(items.map((i) => ({ ...i, title: i.bookId, image: '' }))));
    await TestBed.configureTestingModule({
      declarations: [Checkout, VndPipe],
      imports: [RouterModule],
      providers: [
        provideRouter([]),
        { provide: BookService, useValue: { getCatalog: () => of({ books: [book('a', 240000), book('b', 99000), book('e', 65000, 'ebook')], authors: [], categories: [] }) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    vi.useFakeTimers();
    fixture.detectChanges();
    vi.advanceTimersByTime(400); // sổ địa chỉ mock
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('đơn có sách giấy: đủ 4 bước, chọn sẵn địa chỉ mặc định, tính phí ship', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    expect(el.querySelectorAll('.card').length).toBe(4);
    // sổ địa chỉ mock dùng chung giữa các file test nên so với địa chỉ mặc định hiện tại
    expect(component.addressId()).toBe(component.addresses().find((a) => a.isDefault)?._id);
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

  it('Đặt hàng: tạo đơn, xoá sách khỏi giỏ và hiện màn "Đặt hàng thành công"', async () => {
    await setup([{ bookId: 'a', price: 240000, quantity: 2 }, { bookId: 'e', price: 65000, quantity: 1 }]);
    component.placeOrder();
    vi.advanceTimersByTime(800);
    fixture.detectChanges();
    const order = component.placed()!;
    expect(order.orderCode).toBe('LB-24215');
    expect(order.total).toBe(575000); // 480.000 + 65.000 + ship 30.000 (freeship chỉ tính trên sách giấy: 480.000 < 500.000)
    expect(el.textContent).toContain('Đặt hàng thành công');
    expect(el.textContent).toContain('Sách điện tử trong đơn đã có trong tủ sách của bạn.');
    expect(TestBed.inject(CartService).items().length).toBe(0);
    let saved: string[] = [];
    mockGetOrders().subscribe((list) => (saved = list.map((o) => o.orderCode)));
    vi.advanceTimersByTime(400);
    expect(saved[0]).toBe('LB-24215');
  });

  it('giỏ không có sách được chọn thì báo và dẫn về giỏ hàng', async () => {
    await setup([]);
    expect(el.textContent).toContain('Chưa có sách nào để thanh toán');
  });
});
