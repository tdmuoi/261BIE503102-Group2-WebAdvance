import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { Banners } from './banners';
import { BannerForm } from './banner-form/banner-form';
import { PageHeading } from '../../Components/page-heading/page-heading';
import { StatCard } from '../../Components/stat-card/stat-card';
import { StatusBadge } from '../../Components/status-badge/status-badge';
import { ConfirmDialog } from '../../Components/confirm-dialog/confirm-dialog';
import { Banner, BannerListResponse } from '../../models/banner';

function banner(overrides: Partial<Banner> = {}): Banner {
  return {
    _id: 'h1', name: 'Thương hiệu', title: 'READ LIGHT', subtitle: 'lightbooks.vn', image: null, link: '',
    bgColor: '#1c1917', textColor: '#ffffff', position: 'hero', order: 1, active: true,
    startDate: null, endDate: null, state: 'live', createdAt: null, updatedAt: null, ...overrides,
  };
}

function response(items: Banner[]): BannerListResponse {
  const count = (s: string) => items.filter((b) => b.state === s).length;
  return {
    items,
    counts: { all: items.length, live: count('live'), scheduled: count('scheduled'), expired: count('expired'), off: count('off') },
    positions: ['hero', 'flash_sale', 'promo_strip'],
  };
}

describe('Banners', () => {
  let fixture: ComponentFixture<Banners>;
  let component: Banners;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([]), FormsModule],
      declarations: [Banners, BannerForm, PageHeading, StatCard, StatusBadge, ConfirmDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(Banners);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const flushList = (items: Banner[]) => http.expectOne((r) => r.url.endsWith('/admin/banners') && r.method === 'GET').flush(response(items));

  it('hiển thị banner theo nhóm vị trí', async () => {
    flushList([banner(), banner({ _id: 'h2', name: 'Tết', state: 'scheduled', order: 2 }), banner({ _id: 'f1', name: 'Flash', position: 'flash_sale' })]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.banner-card').length).toBe(3);
    expect(el.querySelectorAll('section.group').length).toBe(3);
    expect(el.textContent).toContain('Hero trang chủ');
    expect(component.groups()[0].items.map((b) => b._id)).toEqual(['h1', 'h2']);
  });

  it('lọc trạng thái', () => {
    flushList([banner(), banner({ _id: 'h2', state: 'off', active: false })]);
    component.stateFilter.set('off');
    expect(component.groups()[0].items.map((b) => b._id)).toEqual(['h2']);
  });

  it('lịch chạy dễ đọc', () => {
    flushList([]);
    expect(component.schedule({ startDate: null, endDate: null })).toBe('Luôn hiển thị');
    expect(component.schedule({ startDate: '2026-10-09T17:00:00Z', endDate: '2026-10-12T16:59:59Z' })).toBe('10/10 – 12/10/2026');
    expect(component.schedule({ startDate: '2027-01-19T17:00:00Z', endDate: null })).toBe('Từ 20/01/2027');
  });

  it('đổi thứ tự: gửi danh sách id mới của cùng vị trí', () => {
    flushList([banner(), banner({ _id: 'h2', order: 2 }), banner({ _id: 'f1', position: 'flash_sale' })]);
    component.move(component.data()!.items[1], -1);
    expect(component.groups()[0].items.map((b) => b._id)).toEqual(['h2', 'h1']);
    const req = http.expectOne((r) => r.url.endsWith('/admin/banners/reorder'));
    expect(req.request.body).toEqual({ ids: ['h2', 'h1'] });
    req.flush({ reordered: 2 });
    flushList([]);
  });

  it('bật/tắt gọi PATCH', () => {
    flushList([banner()]);
    component.toggle(component.data()!.items[0]);
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/admin/banners/h1'));
    expect(req.request.body).toEqual({ active: false });
    req.flush(banner({ active: false, state: 'off' }));
    flushList([]);
  });

  it('xoá chỉ gọi API sau khi xác nhận', () => {
    flushList([banner()]);
    component.deleting.set(component.data()!.items[0]);
    http.expectNone((r) => r.method === 'DELETE');
    component.confirmDelete();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/admin/banners/h1')).flush({ deleted: true });
    expect(component.deleting()).toBeNull();
    flushList([]);
  });
});
