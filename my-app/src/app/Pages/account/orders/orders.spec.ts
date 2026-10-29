import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';

import { VndPipe } from '../../../pipes/vnd-pipe';
import { Orders } from './orders';
import { resetMockOrders } from './orders.mock';

describe('Orders', () => {
  let fixture: ComponentFixture<Orders>;
  let component: Orders;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    resetMockOrders();
    await TestBed.configureTestingModule({
      declarations: [Orders, VndPipe],
      imports: [RouterModule],
      providers: [provideRouter([])],
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

  it('Xem chi tiết mở lịch sử, địa chỉ, thanh toán; "Theo dõi đơn" với đơn đang giao', () => {
    const order = component.orders().find((o) => o.orderCode === 'LB-24186')!;
    component.toggleDetail(order);
    fixture.detectChanges();
    const detail = el.querySelector('.detail')?.textContent ?? '';
    expect(detail).toContain('Lịch sử đơn');
    expect(detail).toContain('Nguyễn Thùy Dung');
    expect(detail).toContain('Ví MoMo');
    expect(component.mailto(order)).toContain('mailto:hello@lightbook.vn');
  });

  it('đơn đã đánh giá hiện "Đã đánh giá ★ 5", đơn ebook có nút "Đọc trong tủ sách"', () => {
    component.setTab('delivered');
    fixture.detectChanges();
    expect(el.textContent).toContain('Đã đánh giá ★ 5');
    expect(el.textContent).toContain('Đọc trong tủ sách');
  });
});
