import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { Homepage } from './homepage';

describe('Homepage', () => {
  let fixture: ComponentFixture<Homepage>;
  let http: HttpTestingController;

  const api = environment.apiUrl;
  const book = {
    _id: 'b1', title: 'Kitchen', image: 'x.jpg', authorId: 'a1', categoryId: 'c1', price: 80000,
    originalPrice: 100000, discountPercent: 20, stock: 5, status: 'active', isbn: null,
    createdAt: '2026-10-01', updatedAt: '2026-10-01',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Homepage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
      // Các section con có test riêng
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(Homepage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  /** Trả rỗng cho mọi request còn mở tới url (bỏ qua request đã huỷ) */
  const flushOpen = (url: string) =>
    http.match(url).filter((req) => !req.cancelled).forEach((req) => req.flush([]));

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('hiện trạng thái đang tải rồi ghép tên tác giả, thể loại vào sách', async () => {
    expect(text()).toContain('Đang tải sách');

    http.expectOne(`${api}/books?limit=200`).flush([book]);
    http.expectOne(`${api}/authors`).flush([{ _id: 'a1', name: 'Banana Yoshimoto' }]);
    http.expectOne(`${api}/categories`).flush([{ _id: 'c1', name: 'Văn học', slug: 'van-hoc' }]);
    await fixture.whenStable();

    const component = fixture.componentInstance as unknown as { books: () => { authorName: string; categoryName: string }[] };
    expect(component.books()[0].authorName).toBe('Banana Yoshimoto');
    expect(component.books()[0].categoryName).toBe('Văn học');
    expect(text()).not.toContain('Đang tải sách');
  });

  it('báo lỗi và cho thử lại khi API sách không phản hồi', async () => {
    http.expectOne(`${api}/books?limit=200`).flush(null, { status: 0, statusText: 'Unknown Error' });
    flushOpen(`${api}/authors`);
    flushOpen(`${api}/categories`);
    await fixture.whenStable();

    expect(text()).toContain('Không kết nối được máy chủ');

    (fixture.nativeElement.querySelector('.status-retry') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(text()).toContain('Đang tải sách');
    flushOpen(`${api}/books?limit=200`);
    flushOpen(`${api}/authors`);
    flushOpen(`${api}/categories`);
  });

  it('vẫn hiện sách khi API tác giả lỗi', async () => {
    http.expectOne(`${api}/books?limit=200`).flush([book]);
    http.expectOne(`${api}/authors`).flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne(`${api}/categories`).flush([]);
    await fixture.whenStable();

    const component = fixture.componentInstance as unknown as { books: () => { authorName: string }[] };
    expect(component.books()[0].authorName).toBe('Đang cập nhật tác giả');
    expect(text()).not.toContain('Không kết nối được máy chủ');
  });
});
