import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { Catalog, CatalogBook } from '../../models/book';
import { BookService } from '../../services/book-service';
import { makeBook } from '../../testing/mock-books';
import { BrowseBook } from './browse-book';

const book = (id: number, overrides: Partial<CatalogBook> = {}): CatalogBook => ({
  ...makeBook({ _id: `b${id}`, title: `Sách ${id}`, authorId: 'a1', authorName: 'Tác giả A' }),
  categorySlug: 'van-hoc',
  categoryName: 'Văn học',
  type: 'new',
  ...overrides,
});

describe('BrowseBook', () => {
  let catalog: Catalog;
  let harness: RouterTestingHarness;

  async function open(url: string, getCatalog = () => of(catalog)) {
    TestBed.configureTestingModule({
      declarations: [BrowseBook],
      providers: [
        provideRouter([{ path: 'books', component: BrowseBook }]),
        { provide: BookService, useValue: { getCatalog } },
      ],
      // Các section con có test riêng
      schemas: [NO_ERRORS_SCHEMA],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, BrowseBook);
    return harness.routeNativeElement as HTMLElement;
  }

  beforeEach(() => {
    // jsdom chưa có scrollIntoView
    Element.prototype.scrollIntoView = () => undefined;
    catalog = {
      books: [
        ...Array.from({ length: 30 }, (_, i) => book(i + 1)),
        book(31, { categorySlug: 'thieu-nhi', categoryName: 'Thiếu nhi' }),
        book(32, { type: 'used' }),
      ],
      authors: [{ _id: 'a1', name: 'Tác giả A' }],
      categories: [
        { _id: 'c1', name: 'Văn học', slug: 'van-hoc' },
        { _id: 'c2', name: 'Thiếu nhi', slug: 'thieu-nhi' },
      ],
    };
  });

  it('lọc theo loại sách trên URL và chia trang 24 cuốn', async () => {
    const el = await open('/books?type=new');
    expect(el.querySelectorAll('app-book-card').length).toBe(24);
    expect(el.querySelector('.results-count')?.textContent).toContain('31 sách mới');
    expect(el.querySelector('app-browse-banner')).not.toBeNull();
  });

  it('chọn chip thể loại thì ghi lên URL và về trang 1', async () => {
    const el = await open('/books?type=new&page=2');
    const chip = [...el.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.textContent?.includes('Thiếu nhi'))!;
    chip.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/books?type=new&category=thieu-nhi');
    expect(harness.routeNativeElement!.querySelectorAll('app-book-card').length).toBe(1);
  });

  it('không có kết quả thì hiện empty state kèm chip bộ lọc đang áp dụng', async () => {
    const el = await open('/books?type=ebook&category=thieu-nhi');
    expect(el.querySelector('app-browse-empty')).not.toBeNull();
    expect(el.querySelector('.active-filters')?.textContent).toContain('Thiếu nhi');
  });

  it('vào từ menu "Sách mới" thì loại sách đã được chọn sẵn và hiện trong "Đang lọc"', async () => {
    const el = await open('/books?type=new');
    expect(el.querySelector('.active-filters')?.textContent).toContain('Sách mới');
    expect(el.querySelector('app-browse-filters')).not.toBeNull();
  });

  it('chọn nhiều loại thì gộp kết quả và không hiện banner của riêng loại nào', async () => {
    const el = await open('/books?type=new,used');
    expect(el.querySelector('.results-count')?.textContent).toContain('32 sách mới, sách cũ');
    expect(el.querySelector('app-browse-banner')).toBeNull();
  });

  it('bỏ chọn sách cũ thì bỏ luôn lọc tình trạng', async () => {
    const el = await open('/books?type=new,used&condition=good');
    const chip = [...el.querySelectorAll<HTMLButtonElement>('.active-chip')].find((c) => c.textContent?.includes('Sách cũ'))!;
    chip.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/books?type=new');
  });

  it('báo lỗi khi không tải được sách', async () => {
    const el = await open('/books', () => throwError(() => new Error('offline')));
    expect(el.querySelector('app-status-card')?.getAttribute('tone')).toBe('error');
  });
});
