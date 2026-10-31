import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, NgForm } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { Vouchers } from './vouchers';
import { Pagination } from '../../Components/pagination/pagination';
import { environment } from '../../../environments/environment';
import { Voucher, VoucherListResponse } from '../../models/voucher';

describe('Vouchers with authenticated HttpClient', () => {
  let fixture: ComponentFixture<Vouchers>;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/admin/vouchers`;
  const authBase = `${environment.apiUrl}/admin/auth`;
  const row: Voucher = {
    _id: '012345678901234567890123',
    code: 'SERVER25',
    name: 'Server voucher',
    description: 'Server voucher',
    type: 'percent',
    value: 15,
    maxDiscount: 50000,
    minOrder: 0,
    limit: 100,
    perCustomer: 1,
    start: '2026-01-01',
    end: '2099-12-31',
    categories: [],
    paused: false,
    newOnly: false,
    suggest: false,
    used: 0,
    state: 'active',
    createdAt: '',
    updatedAt: '',
  };
  const list: VoucherListResponse = {
    items: [row],
    total: 1,
    page: 1,
    limit: 6,
    counts: { all: 1, active: 1, paused: 0, expired: 0, scheduled: 0 },
    summary: { active: 1, expiring: 0, totalUses: null, revenue: null, discount: null },
    asOf: '',
  };
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Vouchers, Pagination],
      imports: [FormsModule, RouterModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Vouchers);
    fixture.detectChanges();
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function allowSession() {
    const request = http.expectOne(authBase + '/session');
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      user: { _id: 'admin', email: 'admin@example.invalid', role: 'admin' },
      csrfToken: 'csrf-test',
      expiresAt: '2099-01-01T00:00:00Z',
    });
  }
  function flushList() {
    http.expectOne((request) => request.url === base).flush(list);
  }
  async function ready() {
    allowSession();
    flushList();
    await fixture.whenStable();
    fixture.detectChanges();
    const nameInput = fixture.nativeElement.querySelector('#voucher-name') as HTMLInputElement;
    nameInput.value = 'New voucher';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  it('requires a server session before requesting vouchers', async () => {
    http.expectNone((request) => request.url === base);
    allowSession();
    const request = http.expectOne((request) => request.url === base);
    expect(request.request.withCredentials).toBe(true);
    request.flush(list);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('SERVER25');
    expect(fixture.nativeElement.textContent).toContain('Chưa có dữ liệu doanh thu');
  });
  it('does not load mock data when unauthenticated', async () => {
    http
      .expectOne(authBase + '/session')
      .flush({ message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
    http.expectNone((request) => request.url === base);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.rows.length).toBe(0);
    expect(fixture.componentInstance.apiError).toContain('đăng nhập lại');
  });
  it('searches, filters and paginates through API', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.search = 'SERVER';
    component.searchChanged();
    let request = http.expectOne((request) => request.url === base);
    expect(request.request.params.get('q')).toBe('SERVER');
    request.flush(list);
    component.selectFilter('paused');
    request = http.expectOne((request) => request.url === base);
    expect(request.request.params.get('status')).toBe('paused');
    request.flush({ ...list, items: [], total: 0 });
    component.changePage(2);
    request = http.expectOne((request) => request.url === base);
    expect(request.request.params.get('page')).toBe('2');
    request.flush(list);
  });
  it('posts editable fields with credentials and CSRF', async () => {
    await ready();
    const component = fixture.componentInstance;
    const input = fixture.nativeElement.querySelector('#code') as HTMLInputElement;
    input.value = 'CREATE25';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne(base);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-Admin-CSRF')).toBe('csrf-test');
    expect(request.request.body.used).toBeUndefined();
    expect(request.request.body.state).toBeUndefined();
    request.flush({ ...row, code: 'CREATE25' }, { status: 201, statusText: 'Created' });
    flushList();
    expect(component.formOpen).toBe(false);
  });
  it('handles duplicate code without closing or losing the form', async () => {
    await ready();
    const component = fixture.componentInstance;
    const input = fixture.nativeElement.querySelector('#code') as HTMLInputElement;
    input.value = 'DUPLICATE';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    http
      .expectOne(base)
      .flush(
        { message: 'Mã voucher đã tồn tại.', errors: { code: 'Chọn mã khác.' } },
        { status: 409, statusText: 'Conflict' },
      );
    expect(component.formOpen).toBe(true);
    expect(component.saving).toBe(false);
    expect(component.errors.join(' ')).toContain('đã tồn tại');
  });
  it('loads fresh detail and sends PUT when editing', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.openForm(row);
    http.expectOne(base + '/' + row._id).flush(row);
    await fixture.whenStable();
    fixture.detectChanges();
    component.draft.description = 'Edited';
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    const request = http.expectOne(base + '/' + row._id);
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('X-Admin-CSRF')).toBe('csrf-test');
    request.flush({ ...row, description: 'Edited' });
    flushList();
  });
  it('cancels detail loading without saving', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.openForm(row);
    const request = http.expectOne(base + '/' + row._id);
    component.closeForm();
    expect(request.cancelled).toBe(true);
    expect(component.formOpen).toBe(false);
    http.expectNone((request) => request.method === 'PUT');
  });
  it('pauses using PATCH and CSRF', async () => {
    await ready();
    fixture.componentInstance.toggleStatus(row);
    const request = http.expectOne(base + '/' + row._id + '/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ paused: true });
    expect(request.request.headers.get('X-Admin-CSRF')).toBe('csrf-test');
    request.flush({ ...row, paused: true, state: 'paused' });
    flushList();
  });
  it('requires native voucher name and disables unsupported schema options', async () => {
    await ready();
    const input = fixture.nativeElement.querySelector('#voucher-name') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    fixture.componentInstance.save(form);
    expect(fixture.componentInstance.errors.join(' ')).toContain('Tên ưu đãi');
    http.expectNone((request) => request.method === 'POST');
    expect(fixture.nativeElement.querySelector('input[name="suggest"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('input[name="newOnly"]').disabled).toBe(true);
  });
  it('shows missing report data and database failure', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.openReport();
    http.expectOne(base + '/report').flush({
      dataAvailable: false,
      items: [],
      revenue: null,
      discount: null,
      totalUses: null,
      message: 'Chưa tích hợp đặt hàng.',
    });
    expect(component.report?.dataAvailable).toBe(false);
    expect(component.leaders.length).toBe(0);
    component.loadVouchers();
    http
      .expectOne((request) => request.url === base)
      .flush({ message: 'DB unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(component.loaded).toBe(false);
    expect(component.rows.length).toBe(0);
  });
});
