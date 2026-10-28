import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { RefundDetail } from './refund-detail';
import { StatusBadge } from '../../../Components/status-badge/status-badge';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';
import { makeReturn } from '../../../testing/mock-returns';

describe('RefundDetail', () => {
  let fixture: ComponentFixture<RefundDetail>;
  let component: RefundDetail;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([]), FormsModule],
      declarations: [RefundDetail, StatusBadge, ConfirmDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(RefundDetail);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const loadWith = (overrides = {}) => {
    component.requestId = 'r1';
    http.expectOne((r) => r.url.endsWith('/admin/returns/r1')).flush(makeReturn(overrides));
  };

  it('hiện nút theo luồng', async () => {
    loadWith();
    await fixture.whenStable();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.actions button')).map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Duyệt yêu cầu', 'Từ chối']);
  });

  it('duyệt gửi thẳng, không hỏi lại', () => {
    loadWith();
    component.act('approved');
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.body).toEqual({ status: 'approved' });
    req.flush(makeReturn({ status: 'approved', nextStatuses: ['received', 'rejected'] }));
    expect(component.request()?.status).toBe('approved');
  });

  it('từ chối bắt buộc nhập lý do', () => {
    loadWith();
    component.act('rejected');
    component.confirmAsk();
    expect(component.askError()).toContain('lý do');
    http.expectNone((r) => r.method === 'PATCH');
    component.note = 'Quá hạn đổi trả';
    component.confirmAsk();
    expect(http.expectOne((r) => r.method === 'PATCH').request.body).toEqual({ status: 'rejected', note: 'Quá hạn đổi trả' });
  });

  it('nhận sách: sách hư hỏng thì mặc định không cộng kho', () => {
    loadWith({ status: 'approved', nextStatuses: ['received', 'rejected'] });
    component.act('received');
    expect(component.restock).toBe(false);
    component.restock = true;
    component.confirmAsk();
    expect(http.expectOne((r) => r.method === 'PATCH').request.body).toEqual({ status: 'received', restock: true });
  });

  it('hoàn tiền: điền sẵn giá trị sách, báo lỗi server hiển thị trong hộp thoại', () => {
    loadWith({ status: 'received', nextStatuses: ['refunded'] });
    component.act('refunded');
    expect(component.refundAmount).toBe(100000);
    component.confirmAsk();
    http.expectOne((r) => r.method === 'PATCH').flush(
      { message: 'x', errors: { refundAmount: 'Không được hoàn quá giá trị sách trả' } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(component.asking()).toBe('refunded');
    expect(component.askError()).toContain('Không được hoàn quá');
  });
});
