import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { Catalog, CatalogBook } from '../../models/book';
import { BookService } from '../../services/book-service';
import { CartService } from '../../services/cart-service';
import { ToastService } from '../../services/toast-service';
import { makeBook } from '../../testing/mock-books';
import { ProductDetail } from './product-detail';
import { ProductDetailModule } from './product-detail-module';

const book = (id: string, overrides: Partial<CatalogBook> = {}): CatalogBook => ({
  ...makeBook({ _id: id, title: `Sách ${id}`, authorId: 'a1', authorName: 'Fredrik Backman', stock: 3 }),
  categorySlug: 'van-hoc',
  categoryName: 'Văn học',
  type: 'new',
  ...overrides,
});

describe('ProductDetail', () => {
  let harness: RouterTestingHarness;

  const catalog: Catalog = {
    books: [
      book('ove', { title: 'Người đàn ông mang tên Ove' }),
      book('b2'),
      book('b3', { authorId: 'a2', authorName: 'Khác' }),
    ],
    authors: [],
    categories: [],
  };

  async function open(url: string): Promise<HTMLElement> {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ProductDetailModule],
      providers: [
        provideRouter([{ path: 'books/:slug', component: ProductDetail }]),
        { provide: BookService, useValue: { getCatalog: () => of(catalog), getReviews: () => of([]) } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, ProductDetail);
    return harness.routeNativeElement as HTMLElement;
  }

  it('hiện sách theo _id, đặt tiêu đề tab và gợi ý sách cùng tác giả', async () => {
    const el = await open('/books/ove');

    expect(el.querySelector('.info-title')?.textContent).toBe('Người đàn ông mang tên Ove');
    expect(TestBed.inject(Title).getTitle()).toBe('Người đàn ông mang tên Ove | Lightbook');
    // b2 cùng tác giả, b3 vào "Sách liên quan"
    const rows = el.querySelectorAll('app-book-row');
    expect(rows[0].querySelectorAll('app-book-card').length).toBe(1);
    expect(rows[1].querySelectorAll('app-book-card').length).toBe(1);
    // Chưa có API đánh giá
    expect(el.querySelector('.reviews-empty')?.textContent).toContain('Chưa có đánh giá');
  });

  it('slug không tồn tại thì hiện "Không tìm thấy sách" kèm nút quay lại /books', async () => {
    const el = await open('/books/khong-co');

    expect(el.textContent).toContain('Không tìm thấy sách');
    expect(el.querySelector('a.pd-status-btn')?.getAttribute('href')).toBe('/books');
  });

  it('thêm vào giỏ: cộng số lượng, báo toast, hiện hộp "Đã có trong giỏ" và không vượt tồn kho', async () => {
    const el = await open('/books/ove');
    const plus = el.querySelector<HTMLButtonElement>('.stepper-plus')!;
    plus.click();
    await harness.fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.cta-add')!.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(CartService).quantityOf('ove')).toBe(2);
    expect(TestBed.inject(ToastService).toasts()[0].message).toBe('Đã thêm 2 cuốn vào giỏ');
    expect(el.querySelector('.in-cart')?.textContent).toContain('Đã có 2 cuốn trong giỏ hàng');
    // Tồn kho 3, đã có 2 → chỉ thêm được 1 nữa
    expect(el.querySelector<HTMLButtonElement>('.stepper-plus')!.disabled).toBe(true);
  });
});
