import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Catalog, CatalogBook } from '../../models/book';
import { BookService } from '../../services/book-service';
import { makeBook } from '../../testing/mock-books';
import { BookBuyback } from './book-buyback';
import { BookBuybackModule } from './book-buyback-module';

const book = (id: string, overrides: Partial<CatalogBook> = {}): CatalogBook => ({
  ...makeBook({ _id: id, title: `Sách ${id}` }),
  authorName: 'Tác giả',
  categoryName: 'Văn học',
  categorySlug: 'van-hoc',
  type: 'new',
  ...overrides,
});

describe('BookBuyback', () => {
  let fixture: ComponentFixture<BookBuyback>;

  async function render(books: CatalogBook[]): Promise<HTMLElement> {
    const catalog: Catalog = { books, authors: [], categories: [] };
    TestBed.configureTestingModule({
      imports: [BookBuybackModule],
      providers: [provideRouter([]), provideHttpClient(), { provide: BookService, useValue: { getCatalog: () => of(catalog) } }],
    });
    fixture = TestBed.createComponent(BookBuyback);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('hiện sách thanh lý thật trong lưới', async () => {
    const el = await render([book('u1', { type: 'used' }), book('n1')]);
    expect(el.querySelectorAll('app-buyback-used app-book-card').length).toBe(1);
  });

  it('hiện empty state khi chưa có sách thanh lý', async () => {
    const el = await render([book('n1')]);
    expect(el.querySelector('app-buyback-used')?.textContent).toContain('Chưa có sách thanh lý trên kệ');
  });

  it('không cho sang bước 2 khi bước 1 còn trống', async () => {
    const el = await render([]);
    const next = [...el.querySelectorAll<HTMLButtonElement>('.bb-foot button')].find((b) => b.textContent?.includes('Tiếp tục'))!;
    next.click();
    fixture.detectChanges();
    expect(el.querySelector('#bb-step1')).not.toBeNull();
    expect(el.textContent).toContain('Nhập tên sách hoặc mã ISBN');
  });
});
