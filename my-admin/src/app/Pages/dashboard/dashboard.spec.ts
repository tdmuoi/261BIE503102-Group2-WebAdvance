import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule } from '@angular/router';

import { Dashboard } from './dashboard';
import { PageHeading } from '../../Components/page-heading/page-heading';
import { StatCard } from '../../Components/stat-card/stat-card';
import { StatusBadge } from '../../Components/status-badge/status-badge';
import { DashboardData } from '../../models/dashboard';

function mockData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    period: { days: 7, from: '2026-10-21T00:00:00Z', to: '2026-10-28T00:00:00Z' },
    stats: {
      revenue: { value: 2090000, change: 12.5 },
      orders: { value: 2, change: -50 },
      customers: { value: 2, new: 1, change: 0 },
      pendingReturns: { value: 3 },
    },
    salesChart: [
      { date: '2026-10-26', label: 'T2', revenue: 1240000, orders: 1 },
      { date: '2026-10-27', label: 'T3', revenue: 850000, orders: 1 },
    ],
    hotCategories: [{ name: 'Hư cấu', value: 2, percent: 67 }],
    categoryBasis: 'sold',
    recentOrders: [
      { _id: 'o1', code: 'LB-20241', customerName: 'Nguyễn Thu Hà', createdAt: null, total: 850000, status: 'pending' },
    ],
    inventory: {
      totalBooks: 3, lowStockCount: 1, outOfStockCount: 1, threshold: 5,
      lowStock: [{ _id: 'b1', title: 'Circe', image: null, stock: 3 }],
    },
    sources: { orders: 'orders', users: 'users', refunds: 'refunds' },
    ...overrides,
  };
}

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let component: Dashboard;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [Dashboard, PageHeading, StatCard, StatusBadge],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('gọi API 7 ngày và hiển thị số liệu', async () => {
    http.expectOne((r) => r.url.endsWith('/admin/dashboard') && r.params.get('days') === '7').flush(mockData());
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('app-stat-card').length).toBe(4);
    expect(el.textContent).toContain('2.090.000');
    expect(el.textContent).toContain('+12,5% so với 7 ngày trước');
    expect(el.textContent).toContain('LB-20241');
    expect(el.textContent).toContain('Circe');
    expect(el.querySelectorAll('.bar').length).toBe(2);
  });

  it('cột cao nhất = 100%, đổi sang 30 ngày thì gọi lại API', async () => {
    http.expectOne(() => true).flush(mockData());
    expect(component.chartBars()[0].height).toBe(100);
    expect(component.chartBars()[1].isToday).toBe(true);

    component.changeDays('30');
    http.expectOne((r) => r.params.get('days') === '30').flush(mockData());
    expect(component.days()).toBe(30);
  });

  it('báo lỗi khi không kết nối được server', async () => {
    http.expectOne(() => true).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();
    expect(component.error()).toContain('npm run dev');
    expect((fixture.nativeElement as HTMLElement).querySelector('.alert')).toBeTruthy();
  });

  it('chưa có collection orders thì hiện ghi chú thay cho biểu đồ', async () => {
    http.expectOne(() => true).flush(mockData({ sources: { orders: null, users: null, refunds: null } }));
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('chưa có collection');
  });
});
