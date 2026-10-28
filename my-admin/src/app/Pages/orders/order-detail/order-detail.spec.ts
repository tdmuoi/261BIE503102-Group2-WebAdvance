import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, convertToParamMap } from '@angular/router';

import { OrderDetail } from './order-detail';
import { StatusBadge } from '../../../Components/status-badge/status-badge';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';
import { makeOrder } from '../../../testing/mock-orders';

describe('OrderDetail', () => {
  let fixture: ComponentFixture<OrderDetail>;
  let component: OrderDetail;
  let http: HttpTestingController;

  async function setup(routeId: string | null = null) {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([]), FormsModule],
      declarations: [OrderDetail, StatusBadge, ConfirmDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  }

  function create() {
    fixture = TestBed.createComponent(OrderDetail);
    component = fixture.componentInstance;
  }

  afterEach(() => http.verify());

  it('link cũ /order-detail/:id chuyển sang /orders?id=', async () => {
    await setup('o9');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    create();
    expect(navigate).toHaveBeenCalledWith(['/orders'], { queryParams: { id: 'o9' }, replaceUrl: true });
  });

  it('tải đơn và hiện các nút theo luồng', async () => {
    await setup();
    create();
    component.orderId = 'o1';
    http.expectOne((r) => r.url.endsWith('/admin/orders/o1')).flush(makeOrder());
    await fixture.whenStable();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.actions button')).map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Xác nhận đơn', 'Huỷ đơn']);
    expect(component.steps().map((s) => s.done)).toEqual([true, false, false, false]);
  });

  it('xác nhận đơn gửi PATCH status và báo cho trang cha', async () => {
    await setup();
    create();
    component.orderId = 'o1';
    http.expectOne(() => true).flush(makeOrder());
    let changed = 0;
    component.changed.subscribe(() => changed++);
    component.act('confirmed');
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/admin/orders/o1/status'));
    expect(req.request.body.status).toBe('confirmed');
    req.flush(makeOrder({ status: 'confirmed', nextStatuses: ['shipping', 'cancelled'] }));
    expect(component.order()?.status).toBe('confirmed');
    expect(changed).toBe(1);
  });

  it('huỷ đơn: phải nhập lý do mới gửi', async () => {
    await setup();
    create();
    component.orderId = 'o1';
    http.expectOne(() => true).flush(makeOrder({ stockDeducted: true }));
    component.act('cancelled');
    expect(component.pending()).toBe('cancelled');
    expect(component.restock).toBe(true);

    component.confirmPending();
    expect(component.reasonError()).toBeTruthy();
    http.expectNone((r) => r.method === 'PATCH');

    component.reason = 'Khách đổi ý';
    component.confirmPending();
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.body).toEqual({ status: 'cancelled', note: 'Khách đổi ý', restock: true });
    req.flush(makeOrder({ status: 'cancelled', nextStatuses: [] }));
    expect(component.pending()).toBeNull();
  });

  it('đơn ebook bỏ qua bước Đang giao', async () => {
    await setup();
    create();
    component.orderId = 'o2';
    http.expectOne(() => true).flush(makeOrder({ onlyEbooks: true, status: 'confirmed', nextStatuses: ['delivered', 'cancelled'] }));
    expect(component.steps().map((s) => s.status)).toEqual(['pending', 'confirmed', 'delivered']);
  });
});
