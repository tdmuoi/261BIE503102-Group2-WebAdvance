import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of, retry, throwError } from 'rxjs';

import { CatalogBook } from '../../models/book';
import { CreateOrderRequest } from '../../models/account';
import { AccountService } from '../../services/account-service';
import { CartFacade } from '../cart/cart-facade';
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

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function captureOrders() {
    const post = vi.spyOn(TestBed.inject(HttpClient), 'post');
    const requests = () => post.mock.calls.filter(([url]) => url.endsWith('/orders')).map(([, body, options]) => ({
      body: body as CreateOrderRequest,
      key: (options?.headers as HttpHeaders).get('Idempotency-Key'),
      authorization: (options?.headers as HttpHeaders).get('Authorization'),
    }));
    return { post, requests };
  }

  it('gửi UUID v4 và giữ Authorization; chặn nhấn liên tục cả trước và sau khi nhận đơn', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    const { requests } = captureOrders();
    component.placeOrder();
    component.placeOrder();
    expect(requests()).toHaveLength(1);
    expect(requests()[0].key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(requests()[0].authorization).toMatch(/^Bearer /);
    vi.advanceTimersByTime(800);
    component.placeOrder();
    expect(requests()).toHaveLength(1);
    expect(component.paying()).not.toBeNull();
  });

  it('retry sau timeout và 503 giữ nguyên khóa, payload; đổi request mới thì tạo khóa mới', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    const { post, requests } = captureOrders();
    for (const status of [0, 503]) {
      post.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
      component.placeOrder();
      expect(component.placing()).toBe(false);
    }
    component.placeOrder();
    expect(requests()).toHaveLength(3);
    expect(new Set(requests().map((r) => r.key)).size).toBe(1);
    expect(requests()[1].body).toEqual(requests()[0].body);
    expect(requests()[2].body).toEqual(requests()[0].body);
    vi.advanceTimersByTime(800);
    component.cancelPayment();
    vi.advanceTimersByTime(500);
    component.placeOrder();
    expect(requests()).toHaveLength(4);
    expect(requests()[3].key).not.toBe(requests()[0].key);
    expect(requests()[3].body).toEqual(requests()[0].body);
  });

  it.each(['cart', 'address', 'shipping', 'payment', 'voucher', 'note', 'combos'])('%s thay đổi sau lỗi phải dùng khóa mới và không sửa payload cũ', async (field) => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    const facade = TestBed.inject(CartFacade);
    const combos = [{ bookIds: ['b'], freeship: false }];
    vi.spyOn(facade, 'combosForOrder').mockImplementation(() => combos);
    const { post, requests } = captureOrders();
    post.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.placeOrder();
    const original = JSON.stringify(requests()[0].body);
    switch (field) {
      case 'cart': facade.setQuantity('b', 2); break;
      case 'address': component.addressId.set('addr-2'); break;
      case 'shipping': component.shipping.set('express'); break;
      case 'payment': component.payment.set('vnpay'); break;
      case 'voucher': facade.setVoucher({ code: 'NEW', type: 'fixed', value: 1000, maxDiscount: null, minOrderValue: 0, description: '' }); break;
      case 'note': component.note.set('New note'); break;
      case 'combos': combos[0].freeship = true; break;
    }
    component.placeOrder();
    expect(requests()).toHaveLength(2);
    expect(requests()[1].key).not.toBe(requests()[0].key);
    expect(JSON.stringify(requests()[0].body)).toBe(original);
    expect(JSON.stringify(requests()[1].body)).not.toBe(original);
  });

  it('COD thành công không thể gửi lại dù giỏ vừa có sách mới', async () => {
    await setup([{ bookId: 'b', price: 99000, quantity: 1 }]);
    component.payment.set('cod');
    const { requests } = captureOrders();
    component.placeOrder();
    vi.advanceTimersByTime(800);
    TestBed.inject(CartFacade).addBook(book('a', 240000));
    component.placeOrder();
    expect(component.placed()).not.toBeNull();
    expect(requests()).toHaveLength(1);
  });

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

describe('Checkout createOrder HTTP retry', () => {
  it('retry Observable gửi cùng header và bản chụp payload dù object nguồn bị sửa', () => {
    localStorage.clear();
    sessionStorage.clear();
    signInForTest();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const body: CreateOrderRequest = { items: [{ bookId: 'b', quantity: 1 }], addressId: 'addr-1',
      shippingMethod: 'standard', paymentMethod: 'cod', voucherCode: null, note: '', combos: [] };
    const key = crypto.randomUUID();
    const result = vi.fn();
    TestBed.inject(AccountService).createOrder(body, key).pipe(retry(1)).subscribe(result);
    const first = http.expectOne((r) => r.url.endsWith('/orders'));
    expect(first.request.method).toBe('POST');
    expect(first.request.headers.get('Idempotency-Key')).toBe(key);
    body.items[0].quantity = 5;
    first.error(new ProgressEvent('error'));
    const second = http.expectOne((r) => r.url.endsWith('/orders'));
    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    expect(second.request.body).toEqual(first.request.body);
    expect(second.request.body.items[0].quantity).toBe(1);
    second.flush({ _id: 'created-order' });
    expect(result).toHaveBeenCalledOnce();
    http.verify();
  });
});
