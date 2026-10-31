import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { Accounts } from './accounts';
import { Pagination } from '../../Components/pagination/pagination';
import { ConfirmDialog } from '../../Components/confirm-dialog/confirm-dialog';
import { environment } from '../../../environments/environment';
import { AdminList, CustomerAccountDetail, CustomerList } from '../../models/account-management';

const customer: CustomerAccountDetail = {
  _id: 'c1',
  fullName: 'Nguyễn An',
  email: 'an@example.invalid',
  phone: '090123',
  tier: 'Vàng',
  points: 10,
  status: 'active',
  createdAt: '2026-10-01',
  orderCount: 1,
  totalSpent: 100000,
  orders: [],
  ordersAvailable: true,
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
const customerList: CustomerList = {
  items: [customer],
  total: 1,
  page: 1,
  limit: 7,
  stats: {
    newCustomers: 1,
    customerChangePercent: null,
    activeAccounts: null,
    activeChangePercent: null,
    goldMembers: 1,
    lockedAccounts: 0,
  },
  tiers: ['Vàng'],
  statuses: [{ value: 'active', label: 'Hoạt động', tone: 'ok' }],
  capabilities: customer.capabilities,
  customerTotal: 1,
  adminTotal: 1,
};
const adminList: AdminList = {
  items: [
    {
      _id: 'a1',
      fullName: 'Admin',
      email: 'admin@example.invalid',
      roleId: 'r1',
      roleName: 'Kho',
      status: 'active',
      emailVerified: true,
      twoFactorEnabled: null,
      isSelf: false,
      protected: false,
      lastLoginAt: null,
      createdAt: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 7,
  statuses: [{ value: 'active', label: 'Hoạt động', tone: 'ok' }],
  roles: {
    roles: [
      {
        _id: 'r1',
        code: 'stock',
        name: 'Kho',
        label: 'Kho',
        editable: true,
        permissionsKnown: true,
      },
      {
        _id: 'r2',
        code: 'editor',
        name: 'Biên tập',
        label: 'Biên tập',
        editable: true,
        permissionsKnown: true,
      },
    ],
    permissions: [{ _id: 'books', label: 'Sách' }],
    grants: { r1: ['books'], r2: [] },
  },
  activity: [],
  security: {
    requireTwoFactor: null,
    forcePasswordRotation: null,
    restrictOfficeIp: null,
    idleTimeoutMinutes: null,
    canUpdate: false,
  },
  capabilities: { invite: false, edit: true, remove: false, roles: true },
  customerTotal: 1,
  adminTotal: 1,
};

describe('Accounts authenticated HTTP and UI', () => {
  let fixture: ComponentFixture<Accounts>, http: HttpTestingController;
  const base = environment.apiUrl + '/admin/accounts';
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Accounts, Pagination, ConfirmDialog],
      imports: [FormsModule, RouterModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Accounts);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  function auth() {
    http.expectOne(environment.apiUrl + '/admin/auth/session').flush({
      user: { _id: 'root', email: 'root@example.invalid', role: 'superadmin' },
      csrfToken: 'csrf',
      expiresAt: '2099-01-01T00:00:00Z',
    });
  }
  function listRequest() {
    return http.expectOne((req) => req.url === base + '/customers');
  }
  async function ready() {
    auth();
    listRequest().flush(customerList);
    http.expectOne(base + '/customers/c1').flush(customer);
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function admins() {
    await ready();
    fixture.componentInstance.setTab('admins');
    http.expectOne((req) => req.url === base + '/admins').flush(structuredClone(adminList));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  it('loads customer cards, panel and full profile link', async () => {
    await ready();
    expect(fixture.nativeElement.textContent).toContain('Nguyễn An');
    expect(fixture.nativeElement.querySelector('a[href="/customer-detail/c1"]')).toBeTruthy();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
  it('does not use mock data on unauthorized API', async () => {
    http
      .expectOne(environment.apiUrl + '/admin/auth/session')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.customerItems().length).toBe(0);
    expect(fixture.componentInstance.error()).toContain('không có quyền');
  });
  it('cancels older lists', async () => {
    auth();
    const old = listRequest();
    fixture.componentInstance.load();
    expect(old.cancelled).toBe(true);
    listRequest().flush({ ...customerList, items: [], total: 0 });
    expect(fixture.componentInstance.customerItems().length).toBe(0);
  });
  it('cancels stale detail and keeps latest selection', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.selectCustomer(customer);
    const old = http.expectOne(base + '/customers/c1');
    component.selectCustomer({ ...customer, _id: 'c2' });
    expect(old.cancelled).toBe(true);
    http.expectOne(base + '/customers/c2').flush({ ...customer, _id: 'c2', fullName: 'Latest' });
    expect(component.selectedCustomer()?._id).toBe('c2');
  });
  it('ignores debounced search from old tab', async () => {
    await ready();
    const component = fixture.componentInstance;
    component.onSearch('stale');
    component.setTab('admins');
    const request = http.expectOne((req) => req.url === base + '/admins');
    expect(request.request.params.get('q')).toBe(null);
    request.flush(adminList);
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectNone((req) => req.url === base + '/customers');
    expect(component.q()).toBe('');
  });
  it('uses filters and admin pagination via API', async () => {
    await admins();
    const component = fixture.componentInstance;
    component.setFilter('status', 'active');
    let request = http.expectOne((req) => req.url === base + '/admins');
    expect(request.request.params.get('status')).toBe('active');
    request.flush({ ...adminList, total: 20 });
    component.goToPage(2);
    request = http.expectOne((req) => req.url === base + '/admins');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ ...adminList, total: 20, page: 2 });
    expect(component.page()).toBe(2);
  });
  it('does not interpret emailVerified as 2FA', async () => {
    await admins();
    expect(fixture.nativeElement.textContent).toContain('Chưa có dữ liệu');
    expect(fixture.nativeElement.textContent).not.toContain('◇ Đã bật');
  });
  it('validates modal and preserves backend failure', async () => {
    await admins();
    const component = fixture.componentInstance;
    component.openAdminEditor();
    fixture.detectChanges();
    await fixture.whenStable();
    component.editEmail.set('bad');
    component.saveAdmin();
    expect(component.editorError()).toContain('email hợp lệ');
    http.expectNone((req) => req.method === 'POST');
    component.editName.set('New Admin');
    component.editEmail.set('new@example.invalid');
    component.saveAdmin();
    const request = http.expectOne(base + '/admins');
    expect(request.request.headers.get('X-Admin-CSRF')).toBe('csrf');
    expect(request.request.withCredentials).toBe(true);
    request.flush(
      { message: 'Invitation not supported' },
      { status: 501, statusText: 'Unsupported' },
    );
    expect(component.editorOpen()).toBe(true);
    expect(component.editorError()).toBe('Invitation not supported');
  });
  it('confirms locking instead of deleting directly', async () => {
    await admins();
    const component = fixture.componentInstance;
    component.removeAdmin(adminList.items[0]);
    http.expectNone((req) => req.method === 'DELETE' || req.method === 'PATCH');
    expect(component.confirmAction()?.kind).toBe('admin');
    component.confirmMutation();
    const request = http.expectOne(base + '/admins/a1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.status).toBe('locked');
    request.flush({ ...adminList.items[0], status: 'locked' });
    http.expectOne((req) => req.url === base + '/admins').flush(adminList);
    expect(component.confirmAction()).toBe(null);
  });
  it('retains only failed permission changes and waits for every request', async () => {
    await admins();
    const component = fixture.componentInstance;
    component.beginPermissionEdit();
    component.setPermissionLevel('r1', 'books', 'read');
    component.setPermissionLevel('r2', 'books', 'manage');
    component.savePermissions();
    const first = http.expectOne(base + '/roles/r1/permissions'),
      second = http.expectOne(base + '/roles/r2/permissions');
    first.flush({});
    expect(component.saving()).toBe(true);
    second.flush({ message: 'Failed role two' }, { status: 500, statusText: 'Failed' });
    expect(component.saving()).toBe(false);
    expect(Object.keys(component.dirtyPermissions())).toEqual(['r2']);
    expect(component.admins()?.roles.grants['r1']).toEqual(['books:read']);
    expect(component.permissionEditing()).toBe(true);
    expect(component.error()).toContain('Failed role two');
    component.savePermissions();
    http.expectOne(base + '/roles/r2/permissions').flush({});
    expect(component.permissionEditing()).toBe(false);
    expect(component.hasPermissionChanges()).toBe(false);
  });
  it('keeps security controls readonly without sending fake updates', async () => {
    await admins();
    fixture.componentInstance.updateSecurity('requireTwoFactor', true);
    http.expectNone(base + '/security');
    expect(fixture.componentInstance.error()).toContain('Không lưu');
  });
  it('renders native module/actions without inventing full access', async () => {
    await ready();
    fixture.componentInstance.setTab('admins');
    http
      .expectOne((request) => request.url === base + '/admins')
      .flush({
        ...adminList,
        capabilities: { ...adminList.capabilities, roles: false },
        roles: { ...adminList.roles, moduleActions: { r1: { books: ['view', 'update'] }, r2: {} } },
      });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.permission-table').textContent).toContain(
      'Xem, Cập nhật',
    );
    expect(fixture.componentInstance.admins()?.capabilities.roles).toBe(false);
  });
  it('clears stale data and reports connection failure', async () => {
    await ready();
    fixture.componentInstance.load();
    listRequest().error(new ProgressEvent('error'));
    expect(fixture.componentInstance.customers()).toBe(null);
    expect(fixture.componentInstance.error()).toContain('Không kết nối');
  });
});
