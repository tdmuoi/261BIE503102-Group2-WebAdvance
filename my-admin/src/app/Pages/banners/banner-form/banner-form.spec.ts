import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';

import { BannerForm, toDateInput } from './banner-form';
import { Banner } from '../../../models/banner';

describe('BannerForm', () => {
  let fixture: ComponentFixture<BannerForm>;
  let component: BannerForm;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [BannerForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(BannerForm);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('ngày ISO -> ô date theo giờ Việt Nam', () => {
    expect(toDateInput('2026-11-26T17:00:00.000Z')).toBe('2026-11-27');
    expect(toDateInput(null)).toBe('');
  });

  it('thêm mới: dùng vị trí được truyền vào, báo lỗi khi thiếu tên và tiêu đề/ảnh', () => {
    component.position = 'flash_sale';
    fixture.detectChanges();
    expect(component.form.position).toBe('flash_sale');
    component.save();
    expect(Object.keys(component.errors()).sort()).toEqual(['name', 'title']);
    http.expectNone((r) => r.method === 'POST');
  });

  it('thêm mới hợp lệ: POST rồi phát sự kiện saved', () => {
    fixture.detectChanges();
    let saved: Banner | undefined;
    component.saved.subscribe((b) => (saved = b));
    Object.assign(component.form, { name: 'Black Friday', title: 'BLACK FRIDAY', startDate: '2026-11-27', endDate: '2026-11-29' });
    component.save();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/admin/banners'));
    expect(req.request.body.startDate).toBe('2026-11-27');
    req.flush({ _id: 'n1', name: 'Black Friday' });
    expect(saved?._id).toBe('n1');
  });

  it('ngày kết thúc trước ngày bắt đầu thì báo lỗi', () => {
    fixture.detectChanges();
    Object.assign(component.form, { name: 'A', title: 'B', startDate: '2026-11-10', endDate: '2026-11-01' });
    component.save();
    expect(component.errors().endDate).toBeTruthy();
  });

  it('sửa: điền sẵn dữ liệu và gửi PUT', () => {
    component.banner = {
      _id: 'h1', name: 'Tết', title: 'TẾT', subtitle: '', image: null, link: '/books', bgColor: '#5b8f84',
      textColor: '#ffffff', position: 'hero', order: 1, active: false, startDate: '2027-01-19T17:00:00Z',
      endDate: null, state: 'off', createdAt: null, updatedAt: null,
    };
    fixture.detectChanges();
    expect(component.form.startDate).toBe('2027-01-20');
    expect(component.form.active).toBe(false);
    component.save();
    http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/admin/banners/h1')).flush({ _id: 'h1', name: 'Tết' });
  });
});
