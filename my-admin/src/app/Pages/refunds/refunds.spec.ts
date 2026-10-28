import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { Refunds } from './refunds';
import { RefundDetail } from './refund-detail/refund-detail';
import { PageHeading } from '../../Components/page-heading/page-heading';
import { StatCard } from '../../Components/stat-card/stat-card';
import { StatusBadge } from '../../Components/status-badge/status-badge';
import { Pagination } from '../../Components/pagination/pagination';
import { ConfirmDialog } from '../../Components/confirm-dialog/confirm-dialog';
import { makeReturn, makeReturnList } from '../../testing/mock-returns';

describe('Refunds', () => {
  let fixture: ComponentFixture<Refunds>;
  let component: Refunds;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([{ path: '**', component: Refunds }]), FormsModule],
      declarations: [Refunds, RefundDetail, PageHeading, StatCard, StatusBadge, Pagination, ConfirmDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(Refunds);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('mặc định mở tab Đang xử lý và hiển thị bảng + lý do', async () => {
    const req = http.expectOne((r) => r.url.endsWith('/admin/returns'));
    expect(req.request.params.get('status')).toBe('open');
    req.flush(makeReturnList([makeReturn(), makeReturn({ _id: 'r2', requestCode: 'RR-002', type: 'exchange', reason: 'wrong_item' })]));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr.row').length).toBe(2);
    expect(el.textContent).toContain('Sách lỗi / hư hỏng');
    expect(el.textContent).toContain('150.000');
    expect(component.reasonStats().map((r) => r.percent)).toEqual([75, 25]);
  });

  it('đổi tab / loại gọi lại API', () => {
    http.expectOne(() => true).flush(makeReturnList([]));
    component.setStatus('refunded');
    http.expectOne((r) => r.params.get('status') === 'refunded').flush(makeReturnList([]));
    component.setType('exchange');
    http.expectOne((r) => r.params.get('type') === 'exchange' && r.params.get('status') === 'refunded').flush(makeReturnList([]));
  });
});
