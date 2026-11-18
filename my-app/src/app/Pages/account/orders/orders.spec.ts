import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';

import { VndPipe } from '../../../pipes/vnd-pipe';
import { Orders } from './orders';
import { provideFakeCustomerApi, signInForTest } from '../../../testing/fake-customer-api';

describe('Orders', () => {
  let fixture: ComponentFixture<Orders>;
  let component: Orders;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    signInForTest();
    await TestBed.configureTestingModule({
      declarations: [Orders, VndPipe],
      imports: [RouterModule],
      providers: [provideRouter([]), provideFakeCustomerApi()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Orders);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    vi.useFakeTimers();
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('đếm đơn theo tab và lọc theo trạng thái', () => {
    const counts = Object.fromEntries(component.tabs().map((t) => [t.value, t.count]));
    expect(counts).toMatchObject({ all: 7, pending: 1, shipping: 1, delivered: 4, cancelled: 1, buyback: 1 });
    component.setTab('shipping');
    fixture.detectChanges();
    expect(component.visible().map((o) => o.orderCode)).toEqual(['LB-24186']);
    expect(el.querySelector('.tracker')?.textContent).toContain('Đang giao');
  });

  it('tìm theo tên sách không dấu', () => {
    component.query.set('lu tre');
    expect(component.visible().map((o) => o.orderCode)).toEqual(['LB-24201', 'LB-23977']);
  });

  it('Huỷ đơn chờ xác nhận sau khi xác nhận', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const order = component.orders().find((o) => o.orderCode === 'LB-24201')!;
    component.cancel(order);
    vi.advanceTimersByTime(500);
    expect(component.orders().find((o) => o.orderCode === 'LB-24201')?.status).toBe('cancelled');
  });

  it('đơn MoMo chưa trả tiền: hiện "Chờ thanh toán" và nút Thanh toán tiếp (không phải đặt lại đơn mới)', () => {
    const order = component.orders().find((o) => o.orderCode === 'LB-24201')!;
    const unpaid = { ...order, paymentMethod: 'momo' as const, paymentStatus: 'unpaid' as const };
    component.orders.update((list) => list.map((o) => (o._id === order._id ? unpaid : o)));
    fixture.detectChanges();
    const card = Array.from(el.querySelectorAll('article.order')).find((a) => a.textContent?.includes('LB-24201'))!;
    expect(card.querySelector('.status')?.textContent).toContain('Chờ thanh toán');
    expect(component.canPay(unpaid)).toBe(true);
    const redirect = vi.spyOn(component, 'openExternal').mockImplementation(() => undefined);
    component.pay(unpaid);
    vi.advanceTimersByTime(500);
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('https://test-payment.momo.vn/'));
    expect(component.canPay({ ...unpaid, paymentStatus: 'paid' })).toBe(false);
  });

  it('Xem chi tiết mở lịch sử, địa chỉ, thanh toán; "Theo dõi đơn" với đơn đang giao', () => {
    const order = component.orders().find((o) => o.orderCode === 'LB-24186')!;
    component.toggleDetail(order);
    fixture.detectChanges();
    const detail = el.querySelector('.detail')?.textContent ?? '';
    expect(detail).toContain('Lịch sử đơn');
    expect(detail).toContain('Nguyễn Thùy Dung');
    expect(detail).toContain('Ví MoMo');
    expect(component.mailto(order)).toContain('mail.google.com/mail/?view=cm&fs=1&to=lightbook14@gmail.com');
  });

  it('tab Thanh lý: "Xem báo giá" hiện giá thu mua admin đã định, "Liên hệ shop" mở Gmail', () => {
    component.setTab('buyback');
    fixture.detectChanges();
    const b = component.buybacks()[0];
    const btn = Array.from(el.querySelectorAll('button')).find((x) => x.textContent?.trim() === 'Xem báo giá')!;
    btn.click();
    fixture.detectChanges();
    expect(el.querySelector('.quote-detail')?.textContent).toContain('Giá thu mua của Lightbook');
    expect(component.quoteOpen()).toBe(b.code);
    const contact = Array.from(el.querySelectorAll('a')).find((x) => x.textContent?.trim() === 'Liên hệ shop')!;
    expect(contact.getAttribute('href')).toContain('to=lightbook14@gmail.com');
    expect(contact.getAttribute('target')).toBe('_blank');
  });

  it('đơn đã đánh giá hiện "Đã đánh giá ★ 5", đơn ebook có nút "Đọc trong tủ sách"', () => {
    component.setTab('delivered');
    fixture.detectChanges();
    expect(el.textContent).toContain('Đã đánh giá ★ 5');
    expect(el.textContent).toContain('Đọc trong tủ sách');
  });
});
