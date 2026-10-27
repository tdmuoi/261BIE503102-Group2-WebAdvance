import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, convertToParamMap } from '@angular/router';

import { BookForm } from './book-form';
import { PageHeading } from '../../../Components/page-heading/page-heading';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';

describe('BookForm', () => {
  let fixture: ComponentFixture<BookForm>;
  let component: BookForm;
  let http: HttpTestingController;

  async function setup(id: string | null) {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([]), FormsModule],
      declarations: [BookForm, PageHeading, ConfirmDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BookForm);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url.endsWith('/categories')).flush([{ _id: 'c1', name: 'Văn học', slug: 'fiction' }]);
    http.expectOne((r) => r.url.endsWith('/authors')).flush([{ _id: 'a1', name: 'Nguyễn Nhật Ánh' }]);
  }

  afterEach(() => http.verify());

  it('thêm mới: báo lỗi khi thiếu thông tin, không gọi API', async () => {
    await setup(null);
    component.save();
    expect(Object.keys(component.errors()).sort()).toEqual(['categoryId', 'price', 'title']);
    http.expectNone((r) => r.method === 'POST');
  });

  it('thêm mới: gửi đúng dữ liệu, tác giả có sẵn thì gửi authorId', async () => {
    await setup(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    Object.assign(component.form, {
      title: 'Mắt biếc', authorName: 'nguyễn nhật ánh', categoryId: 'c1', price: 80000, originalPrice: 100000, stock: 5,
    });
    expect(component.discountPercent).toBe(20);
    expect(component.isNewAuthor).toBe(false);

    component.save();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/admin/books'));
    expect(req.request.body.authorId).toBe('a1');
    expect(req.request.body.price).toBe(80000);
    req.flush({ _id: 'b9', title: 'Mắt biếc' });
    expect(navigate).toHaveBeenCalledWith(['/book-list'], { state: { flash: 'Đã thêm sách "Mắt biếc"' } });
  });

  it('hiện lỗi validate do server trả về', async () => {
    await setup(null);
    Object.assign(component.form, { title: 'X', categoryId: 'c1', price: 1 });
    component.save();
    http.expectOne((r) => r.method === 'POST').flush(
      { message: 'Dữ liệu chưa hợp lệ', errors: { categoryId: 'Thể loại không tồn tại' } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(component.errors().categoryId).toBe('Thể loại không tồn tại');
  });

  it('sửa: tải sách vào form rồi gửi PUT', async () => {
    await setup('b1');
    http.expectOne((r) => r.url.endsWith('/admin/books/b1')).flush({
      _id: 'b1', title: 'Circe', authorId: null, authorName: '', categoryId: 'c1', categoryName: 'Văn học',
      price: 95000, originalPrice: 150000, discountPercent: 37, stock: 3, status: 'hidden', isbn: null, image: null,
      createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
    });
    expect(component.loading()).toBe(false);
    expect(component.form.title).toBe('Circe');
    expect(component.form.status).toBe('hidden');

    component.form.stock = 10;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.save();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/admin/books/b1'));
    expect(req.request.body.stock).toBe(10);
    req.flush({ _id: 'b1', title: 'Circe' });
  });

  it('sửa: sách không tồn tại thì báo không tìm thấy', async () => {
    await setup('zzz');
    http.expectOne((r) => r.url.endsWith('/admin/books/zzz')).flush({ message: 'x' }, { status: 404, statusText: 'Not Found' });
    expect(component.notFound()).toBe(true);
  });
});
