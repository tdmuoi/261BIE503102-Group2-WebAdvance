import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { Orders } from './orders';
import { OrderDetail } from './order-detail/order-detail';
import { PageHeading } from '../../Components/page-heading/page-heading';
import { StatCard } from '../../Components/stat-card/stat-card';
import { StatusBadge } from '../../Components/status-badge/status-badge';
import { Pagination } from '../../Components/pagination/pagination';
import { ConfirmDialog } from '../../Components/confirm-dialog/confirm-dialog';
import { Order, OrderListResponse } from '../../models/order';
import { makeOrder } from '../../testing/mock-orders';

function response(items: Order[], total = items.length): OrderListResponse {
  return {
    items, total, page: 1, limit: 10,
    counts: { all: total, pending: 1, confirmed: 0, shipping: 0, delivered: 0, cancelled: 0, returned: 0 },
  };
}

describe('Orders', () => {
  let fixture: ComponentFixture<Orders>;
  let component: Orders;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([{ path: '**', component: Orders }]), FormsModule],
      declarations: [Orders, OrderDetail, PageHeading, StatCard, StatusBadge, Pagination, ConfirmDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(Orders);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const flushList = (res: OrderListResponse) =>
    http.expectOne((r) => r.url.endsWith('/admin/orders') && r.method === 'GET').flush(res);

  it('hiển thị bảng đơn với nhãn trạng thái tiếng Việt', async () => {
    flushList(response([makeOrder(), makeOrder({ _id: 'o2', orderCode: 'LB-002', status: 'shipping', paymentStatus: 'paid' })], 12));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr.row').length).toBe(2);
    expect(el.textContent).toContain('Chờ xác nhận');
    expect(el.textContent).toContain('Đang giao');
    expect(el.textContent).toContain('225.000đ');
    expect(el.textContent).toContain('Hiển thị 1–10 trong 12 đơn');
  });

  it('lọc trạng thái + ngày gửi đúng tham số', () => {
    flushList(response([]));
    component.setFilter('status', 'shipping');
    http.expectOne((r) => r.params.get('status') === 'shipping').flush(response([]));
    component.setFilter('from', '2026-10-01');
    const req = http.expectOne((r) => r.params.get('from') === '2026-10-01');
    expect(req.request.params.get('status')).toBe('shipping');
    req.flush(response([]));
  });

  it('bấm vào dòng thì đưa id đơn lên URL để mở panel', async () => {
    flushList(response([makeOrder()]));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.open(makeOrder());
    expect(navigate.mock.calls[0][1]?.queryParams).toEqual({ id: 'o1' });
  });
});
