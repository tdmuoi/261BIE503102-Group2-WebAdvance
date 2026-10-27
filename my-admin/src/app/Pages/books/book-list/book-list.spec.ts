import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule } from '@angular/router';

import { BookList } from './book-list';
import { PageHeading } from '../../../Components/page-heading/page-heading';
import { StatCard } from '../../../Components/stat-card/stat-card';
import { StatusBadge } from '../../../Components/status-badge/status-badge';
import { Pagination } from '../../../Components/pagination/pagination';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';
import { AdminBook, BookListResponse } from '../../../models/book';

function book(overrides: Partial<AdminBook> = {}): AdminBook {
  return {
    _id: 'b1', title: 'Mắt biếc', image: null, authorId: 'a1', authorName: 'Nguyễn Nhật Ánh',
    categoryId: 'c1', categoryName: 'Văn học', price: 80000, originalPrice: 100000, discountPercent: 20,
    stock: 12, status: 'active', isbn: null, createdAt: '', updatedAt: '', ...overrides,
  };
}

function response(items: AdminBook[], total = items.length): BookListResponse {
  return { items, total, page: 1, limit: 10, counts: { all: total, active: total, hidden: 0, low: 0, out: 0 }, lowStockThreshold: 5 };
}

describe('BookList', () => {
  let fixture: ComponentFixture<BookList>;
  let component: BookList;
  let http: HttpTestingController;

  const flushList = (res: BookListResponse) =>
    http.expectOne((r) => r.url.endsWith('/admin/books') && r.method === 'GET').flush(res);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [BookList, PageHeading, StatCard, StatusBadge, Pagination, ConfirmDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(BookList);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/categories')).flush([]);
  });

  afterEach(() => http.verify());

  it('tải và hiển thị danh sách sách', async () => {
    flushList(response([book(), book({ _id: 'b2', title: 'Circe', stock: 3 })], 25));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.textContent).toContain('Mắt biếc');
    expect(el.textContent).toContain('80.000đ');
    expect(el.textContent).toContain('Hiển thị 1–10 trong 25 sách');
  });

  it('badge theo tồn kho và trạng thái', () => {
    flushList(response([]));
    expect(component.badge(book({ stock: 0 })).label).toBe('Hết hàng');
    expect(component.badge(book({ stock: 4 })).label).toBe('Sắp hết');
    expect(component.badge(book({ status: 'hidden', stock: 0 })).label).toBe('Đã ẩn');
    expect(component.badge(book()).label).toBe('Đang bán');
  });

  it('đổi tab trạng thái thì gọi lại API với status và về trang 1', () => {
    flushList(response([book()]));
    component.page.set(3);
    component.setStatus('low');
    const req = http.expectOne((r) => r.url.endsWith('/admin/books'));
    expect(req.request.params.get('status')).toBe('low');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(response([]));
  });

  it('chọn tất cả rồi xoá: hỏi lại bằng dialog, xác nhận mới gọi API', async () => {
    flushList(response([book(), book({ _id: 'b2' })]));
    component.toggleAll();
    expect(component.selected().size).toBe(2);

    component.askDeleteSelected();
    expect(component.pending()?.ids).toEqual(['b1', 'b2']);
    http.expectNone((r) => r.method === 'PATCH');

    component.confirmPending();
    const req = http.expectOne((r) => r.url.endsWith('/admin/books/bulk'));
    expect(req.request.body).toEqual({ ids: ['b1', 'b2'], action: 'delete' });
    req.flush({ modified: 2 });
    expect(component.pending()).toBeNull();
    flushList(response([]));
  });

  it('báo lỗi khi server không chạy', () => {
    http.expectOne((r) => r.url.endsWith('/admin/books')).error(new ProgressEvent('error'), { status: 0 });
    expect(component.error()).toContain('npm run dev');
  });
});
