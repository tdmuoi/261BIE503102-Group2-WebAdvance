import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, RouterModule, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CustomerDetail } from './customer-detail';
import { PageHeading } from '../../../Components/page-heading/page-heading';
import { StatCard } from '../../../Components/stat-card/stat-card';
import { Pagination } from '../../../Components/pagination/pagination';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';
import { environment } from '../../../../environments/environment';
import { CustomerAccountDetail } from '../../../models/account-management';

describe('CustomerDetail route and API', () => {
  let fixture: ComponentFixture<CustomerDetail>, http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const base = environment.apiUrl + '/admin/accounts/customers';
  const customer: CustomerAccountDetail = {
    _id: 'c1',
    fullName: 'Customer One',
    email: 'one@example.invalid',
    phone: null,
    tier: null,
    points: null,
    status: 'active',
    createdAt: null,
    orderCount: 1,
    totalSpent: 100000,
    orders: [
      {
        _id: 'o1',
        code: 'ORDER1',
        total: 100000,
        status: 'delivered',
        createdAt: '2026-10-01',
        items: [{ title: 'Book', image: '', quantity: 2, format: null }],
      },
    ],
    ordersAvailable: true,
    returns: {
      available: true,
      items: [{ _id: 'rr1', code: 'RR1', amount: 50000, status: 'refunded', createdAt: null }],
    },
    address: null,
    birthday: null,
    customerCode: 'c1',
    vip: false,
    internalNote: null,
    metrics: {
      averageOrderValue: 100000,
      repurchaseRate: null,
      booksPurchased: 2,
      lastPurchaseAt: null,
    },
    behavior: null,
    capabilities: { sendEmail: false, resetPassword: false, lock: true },
  };
  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ id: 'c1' }));
    await TestBed.configureTestingModule({
      declarations: [CustomerDetail, PageHeading, StatCard, Pagination, ConfirmDialog],
      imports: [RouterModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CustomerDetail);
    fixture.detectChanges();
    http
      .expectOne(environment.apiUrl + '/admin/auth/session')
      .flush({
        user: { _id: 'root', role: 'superadmin' },
        csrfToken: 'csrf',
        expiresAt: '2099-01-01T00:00:00Z',
      });
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  async function ready() {
    http.expectOne(base + '/c1').flush(customer);
    await fixture.whenStable();
    fixture.detectChanges();
  }
  it('loads ID from route and displays real order', async () => {
    await ready();
    expect(fixture.componentInstance.customer()?._id).toBe('c1');
    expect(fixture.nativeElement.textContent).toContain('ORDER1');
    expect(fixture.nativeElement.textContent).toContain('Customer One');
  });
  it('cancels old ID when route changes', () => {
    const old = http.expectOne(base + '/c1');
    params.next(convertToParamMap({ id: 'c2' }));
    expect(old.cancelled).toBe(true);
    http.expectOne(base + '/c2').flush({ ...customer, _id: 'c2', fullName: 'Latest' });
    expect(fixture.componentInstance.customer()?._id).toBe('c2');
  });
  it('handles missing route ID', () => {
    http.expectOne(base + '/c1').flush(customer);
    params.next(convertToParamMap({}));
    expect(fixture.componentInstance.customer()).toBe(null);
    expect(fixture.componentInstance.error()).toContain('Thiếu ID');
  });
  it('handles 404 without fallback data', () => {
    http
      .expectOne(base + '/c1')
      .flush({ message: 'Missing' }, { status: 404, statusText: 'Missing' });
    expect(fixture.componentInstance.customer()).toBe(null);
    expect(fixture.componentInstance.error()).toContain('Không tìm thấy');
  });
  it('shows stored return history', async () => {
    await ready();
    fixture.componentInstance.transactionTab.set('returns');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('RR1');
    expect(fixture.nativeElement.textContent).toContain('50.000đ');
  });
  it('does not fake unsupported behavior or email actions', async () => {
    await ready();
    expect(fixture.nativeElement.textContent).toContain('Chưa có dữ liệu đọc sách');
    const send = Array.from(fixture.nativeElement.querySelectorAll('button')).find((button: any) =>
      button.textContent.includes('Gửi email'),
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });
  it('confirms a customer lock before PATCH-like action', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.requestLock();
    http.expectNone((req) => req.method === 'POST');
    component.confirmLock();
    const request = http.expectOne(base + '/c1/actions');
    expect(request.request.body).toEqual({ action: 'lock' });
    expect(request.request.headers.get('X-Admin-CSRF')).toBe('csrf');
    request.flush({});
    http.expectOne(base + '/c1').flush({ ...customer, status: 'locked' });
    expect(component.customer()?.status).toBe('locked');
    expect(component.confirming()).toBe(false);
  });
  it('does not report success after failed action', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.requestLock();
    component.confirmLock();
    http
      .expectOne(base + '/c1/actions')
      .flush({ message: 'Denied' }, { status: 403, statusText: 'Denied' });
    expect(component.message()).toBe('');
    expect(component.error()).toContain('không có quyền');
  });
  it('resets pending confirmation when route changes', async () => {
    await ready();
    fixture.componentInstance.requestLock();
    params.next(convertToParamMap({ id: 'c2' }));
    expect(fixture.componentInstance.confirming()).toBe(false);
    http.expectOne(base + '/c2').flush({ ...customer, _id: 'c2' });
  });
});
