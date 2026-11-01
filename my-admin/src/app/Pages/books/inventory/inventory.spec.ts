import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Inventory } from './inventory';
import { BookService } from '../../../services/book-service';
import { AdminAuthService } from '../../../services/admin-auth-service';
import { AdminBook, BookListResponse } from '../../../models/book';
import { PageHeading } from '../../../Components/page-heading/page-heading';
import { StatCard } from '../../../Components/stat-card/stat-card';
import { StatusBadge } from '../../../Components/status-badge/status-badge';
import { Pagination } from '../../../Components/pagination/pagination';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';
const book = (id: string, stock: number, extra: Record<string, unknown> = {}): AdminBook => ({
  _id: id,
  title: 'Book ' + id,
  image: null,
  authorId: null,
  authorName: 'Author',
  categoryId: null,
  categoryName: '',
  price: 100000,
  originalPrice: 100000,
  discountPercent: 0,
  stock,
  status: 'active',
  isbn: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...extra,
});
const page = (
  items: AdminBook[],
  total = items.length,
  current = 1,
  limit = 100,
): BookListResponse => ({
  items,
  total,
  page: current,
  limit,
  counts: { all: total, active: total, hidden: 0, low: 0, out: 0 },
  lowStockThreshold: 5,
});
describe('Inventory with persisted BookService data', () => {
  let fixture: ComponentFixture<Inventory>;
  const books = { getBooks: vi.fn() };
  const auth = {
    user: { role: 'superadmin', permissions: [] as { module: string; actions: string[] }[] },
    withSession: <T>(work: () => T) => work(),
  };
  beforeEach(async () => {
    books.getBooks
      .mockReset()
      .mockReturnValue(
        of(
          page([
            book('low', 3, { sku: 'LB-001', stockThreshold: 5 }),
            book('out', 0),
            book('in', 25),
            book('ebook', 999, { bookType: 'ebook' }),
          ]),
        ),
      );
    auth.user = { role: 'superadmin', permissions: [] };
    await TestBed.configureTestingModule({
      declarations: [Inventory, PageHeading, StatCard, StatusBadge, Pagination, ConfirmDialog],
      imports: [FormsModule, RouterModule],
      providers: [
        provideRouter([]),
        { provide: BookService, useValue: books },
        { provide: AdminAuthService, useValue: auth },
      ],
    }).compileComponents();
  });
  afterEach(() => vi.restoreAllMocks());
  async function create() {
    fixture = TestBed.createComponent(Inventory);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  it('uses real stock totals, excludes Ebook and never values inventory at selling price', async () => {
    const inventory = await create();
    expect(inventory.summary()).toMatchObject({ total: 28, titles: 3, low: 1, out: 1 });
    expect(inventory.excludedEbooks()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Chưa có giá nhập');
    expect(inventory.rows().some((row) => row._id === 'ebook')).toBe(false);
  });
  it('uses per-book thresholds before the API fallback', async () => {
    books.getBooks.mockReturnValue(
      of(
        page([
          book('a', 7, { stockThreshold: 10 }),
          book('b', 3, { stockThreshold: 1 }),
          book('c', 2),
        ]),
      ),
    );
    const inventory = await create();
    expect(inventory.status(inventory.rows()[0])).toBe('low');
    expect(inventory.status(inventory.rows()[1])).toBe('in');
    expect(inventory.threshold(inventory.rows()[2])).toBe(5);
  });
  it('reads every backend page before exposing totals', async () => {
    books.getBooks.mockImplementation(({ page: current }) =>
      of(
        current === 1
          ? page([book('a', 2), book('b', 3)], 4, 1, 2)
          : page([book('c', 4), book('d', 5)], 4, 2, 2),
      ),
    );
    const inventory = await create();
    expect(books.getBooks).toHaveBeenCalledTimes(2);
    expect(inventory.summary().total).toBe(14);
    expect(inventory.rows().length).toBe(4);
  });
  it('does not invent zero stock while the API is pending', async () => {
    const response = new Subject<BookListResponse>();
    books.getBooks.mockReturnValue(response);
    fixture = TestBed.createComponent(Inventory);
    fixture.detectChanges();
    expect(fixture.componentInstance.loaded()).toBe(false);
    expect(fixture.componentInstance.rows()).toEqual([]);
    response.next(page([book('a', 8)]));
    response.complete();
    await fixture.whenStable();
    expect(fixture.componentInstance.summary().total).toBe(8);
  });
  it('rejects duplicate rows across pages instead of reporting partial totals', async () => {
    books.getBooks.mockImplementation(({ page: current }) =>
      of(current === 1 ? page([book('a', 2)], 2, 1, 1) : page([book('a', 3)], 2, 2, 1)),
    );
    const inventory = await create();
    expect(inventory.loaded()).toBe(false);
    expect(inventory.rows()).toEqual([]);
    expect(inventory.error()).toContain('thay đổi');
  });
  it('searches SKU, filters stock and resets pagination', async () => {
    const inventory = await create();
    inventory.goToPage(2);
    inventory.search('LB-001');
    expect(inventory.page()).toBe(1);
    expect(inventory.filtered().length).toBe(1);
    inventory.setFilter('out');
    expect(inventory.filtered().length).toBe(0);
    inventory.search('');
    expect(inventory.filtered()[0]._id).toBe('out');
  });
  it('keeps invalid/missing stock unknown rather than treating it as empty stock', async () => {
    books.getBooks.mockReturnValue(of(page([book('a', Number.NaN)])));
    const inventory = await create();
    expect(inventory.summary().total).toBeNull();
    expect(inventory.summary().out).toBe(0);
    expect(inventory.status(inventory.rows()[0])).toBe('unknown');
  });
  it('shows API failures without sample rows', async () => {
    books.getBooks.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const inventory = await create();
    expect(inventory.rows()).toEqual([]);
    expect(inventory.loading()).toBe(false);
    expect(inventory.error()).toContain('backend');
  });
  it('checks the existing inventory view permission before loading books', async () => {
    auth.user = { role: 'admin', permissions: [] };
    const inventory = await create();
    expect(books.getBooks).not.toHaveBeenCalled();
    expect(inventory.error()).toContain('quyền');
  });
  it('stock-in/history controls explain unsupported actions without changing quantities', async () => {
    const inventory = await create();
    inventory.stockIn(inventory.rows()[0]);
    expect(inventory.dialogOpen()).toBe(true);
    expect(inventory.dialogMessage()).toContain('Chưa lưu');
    inventory.bulkStockIn();
    inventory.showHistory();
    expect(inventory.rows()[0].stock).toBe(3);
    expect(books.getBooks).toHaveBeenCalledTimes(1);
  });
  it('exports filtered CSV data and escapes spreadsheet formulas', async () => {
    books.getBooks.mockReturnValue(
      of(page([book('a', 2, { title: '=SUM(1,2)', sku: 'EXPORT' }), book('b', 9)])),
    );
    const inventory = await create();
    inventory.search('EXPORT');
    const original = URL.createObjectURL;
    const createUrl = vi.fn((_blob: Blob) => 'blob:inventory-test');
    Object.defineProperty(URL, 'createObjectURL', {
      value: createUrl,
      writable: true,
      configurable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      inventory.exportCsv();
      expect(createUrl).toHaveBeenCalledOnce();
      const blob = createUrl.mock.calls[0][0];
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      expect(text).toContain("'=SUM(1,2)");
      expect(text).toContain('EXPORT');
      expect(text).not.toContain('Book b');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });
});
