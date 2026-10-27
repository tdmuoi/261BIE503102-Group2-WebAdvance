import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { AdminBook, BookListResponse, BookQuery, Category } from '../../../models/book';
import { BookService } from '../../../services/book-service';

type StatusTab = NonNullable<BookQuery['status']>;

/** Hộp thoại xác nhận đang mở cho thao tác nào */
interface PendingAction {
  ids: string[];
  action: 'delete' | 'hide';
  title: string;
  message: string;
  note: string;
  confirmText: string;
}

/**
 * Trang Quản lý sách: tìm kiếm, lọc theo trạng thái/thể loại, sắp xếp, phân trang,
 * chọn nhiều để ẩn/hiện/xoá. Xoá luôn hỏi lại bằng app-confirm-dialog.
 * (my-admin chạy zoneless nên trạng thái dùng signal)
 */
@Component({
  selector: 'app-book-list',
  standalone: false,
  styleUrl: './book-list.css',
  templateUrl: './book-list.html',
})
export class BookList {
  private readonly bookService = inject(BookService);
  private readonly route = inject(ActivatedRoute);

  readonly tabs: { value: StatusTab; label: string; countKey: keyof BookListResponse['counts'] }[] = [
    { value: '', label: 'Tất cả', countKey: 'all' },
    { value: 'active', label: 'Đang bán', countKey: 'active' },
    { value: 'hidden', label: 'Đã ẩn', countKey: 'hidden' },
    { value: 'low', label: 'Sắp hết', countKey: 'low' },
    { value: 'out', label: 'Hết hàng', countKey: 'out' },
  ];

  readonly sortOptions: { value: NonNullable<BookQuery['sort']>; label: string }[] = [
    { value: 'newest', label: 'Mới thêm' },
    { value: 'updated', label: 'Mới cập nhật' },
    { value: 'title', label: 'Tên A → Z' },
    { value: 'price_asc', label: 'Giá thấp → cao' },
    { value: 'price_desc', label: 'Giá cao → thấp' },
    { value: 'stock_asc', label: 'Tồn kho ít nhất' },
  ];

  // ----- Bộ lọc -----
  readonly q = signal('');
  readonly status = signal<StatusTab>('');
  readonly categoryId = signal('');
  readonly sort = signal<NonNullable<BookQuery['sort']>>('newest');
  readonly page = signal(1);
  readonly pageSize = 10;

  // ----- Dữ liệu -----
  readonly data = signal<BookListResponse | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly flash = signal('');

  // ----- Chọn nhiều + xác nhận -----
  readonly selected = signal<Set<string>>(new Set());
  readonly pending = signal<PendingAction | null>(null);
  readonly working = signal(false);

  readonly books = computed(() => this.data()?.items ?? []);
  readonly allChecked = computed(() => this.books().length > 0 && this.books().every((b) => this.selected().has(b._id)));
  readonly someChecked = computed(() => this.selected().size > 0 && !this.allChecked());

  private readonly search$ = new Subject<string>();

  constructor() {
    const message = typeof history !== 'undefined' ? history.state?.flash : '';
    if (message) this.showFlash(message);

    this.bookService.getCategories().subscribe({ next: (list) => this.categories.set(list), error: () => {} });

    // Ô tìm kiếm: chờ người dùng ngừng gõ 300ms mới gọi API
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((text) => {
      this.q.set(text);
      this.page.set(1);
      this.load();
    });

    // Tìm từ ô search trên topbar: /book-list?q=...
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.q.set(params.get('q') ?? '');
      this.page.set(1);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.bookService
      .getBooks({
        q: this.q(),
        status: this.status(),
        categoryId: this.categoryId(),
        sort: this.sort(),
        page: this.page(),
        limit: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          // Trang hiện tại trống (vd vừa xoá hết sách ở trang cuối) thì lùi 1 trang
          if (!res.items.length && res.total > 0 && this.page() > 1) {
            this.page.set(Math.ceil(res.total / this.pageSize));
            this.load();
            return;
          }
          this.data.set(res);
          this.selected.set(new Set());
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(
            err.status === 0
              ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
              : 'Không tải được danh sách sách. Xem terminal của my-server để biết chi tiết.',
          );
          this.loading.set(false);
        },
      });
  }

  // ----- Bộ lọc -----
  onSearch(text: string): void {
    this.search$.next(text.trim());
  }

  setStatus(value: StatusTab): void {
    this.status.set(value);
    this.page.set(1);
    this.load();
  }

  setCategory(value: string): void {
    this.categoryId.set(value);
    this.page.set(1);
    this.load();
  }

  setSort(value: string): void {
    this.sort.set(value as NonNullable<BookQuery['sort']>);
    this.page.set(1);
    this.load();
  }

  goToPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  // ----- Chọn nhiều -----
  toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  selectedIds(): string[] {
    return [...this.selected()];
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  toggleAll(): void {
    this.selected.set(this.allChecked() ? new Set() : new Set(this.books().map((b) => b._id)));
  }

  // ----- Thao tác -----
  /** Ẩn/hiện 1 sách hoặc các sách đang chọn (không cần hỏi lại vì làm lại được) */
  setVisibility(ids: string[], visible: boolean): void {
    if (!ids.length) return;
    this.working.set(true);
    this.bookService.bulk(ids, visible ? 'show' : 'hide').subscribe({
      next: (res) => {
        this.working.set(false);
        this.showFlash(`Đã ${visible ? 'hiện' : 'ẩn'} ${res.modified} sách ${visible ? 'trên' : 'khỏi'} website`);
        this.load();
      },
      error: () => this.fail('Không cập nhật được trạng thái sách'),
    });
  }

  askDelete(book: AdminBook): void {
    this.pending.set({
      ids: [book._id],
      action: 'delete',
      title: `Xoá sách "${book.title}"?`,
      message: 'Sách sẽ bị gỡ khỏi website và danh sách quản lý. Các đơn hàng cũ vẫn giữ thông tin sách.',
      note: book.stock > 0 ? `Còn ${book.stock.toLocaleString('vi-VN')} cuốn tồn kho` : '',
      confirmText: 'Xoá sách',
    });
  }

  askDeleteSelected(): void {
    const ids = [...this.selected()];
    const stock = this.books().filter((b) => this.selected().has(b._id)).reduce((s, b) => s + b.stock, 0);
    this.pending.set({
      ids,
      action: 'delete',
      title: `Xoá ${ids.length} sách đã chọn?`,
      message: 'Các sách này sẽ bị gỡ khỏi website và danh sách quản lý. Các đơn hàng cũ vẫn giữ thông tin sách.',
      note: stock > 0 ? `Tổng còn ${stock.toLocaleString('vi-VN')} cuốn tồn kho` : '',
      confirmText: `Xoá ${ids.length} sách`,
    });
  }

  confirmPending(): void {
    const p = this.pending();
    if (!p) return;
    this.working.set(true);
    const request: Observable<unknown> =
      p.ids.length === 1 ? this.bookService.deleteBook(p.ids[0]) : this.bookService.bulk(p.ids, 'delete');
    request.subscribe({
      next: () => {
        this.working.set(false);
        this.pending.set(null);
        this.showFlash(`Đã xoá ${p.ids.length} sách`);
        this.load();
      },
      error: () => {
        this.pending.set(null);
        this.fail('Xoá sách thất bại, vui lòng thử lại');
      },
    });
  }

  // ----- Hiển thị -----
  money(value: number): string {
    return (value ?? 0).toLocaleString('vi-VN') + 'đ';
  }

  /** 83,3% */
  percentOf(part: number, total: number): string {
    return total ? (Math.round((part / total) * 1000) / 10).toLocaleString('vi-VN') + '%' : '0%';
  }

  /** Mã trạng thái cho app-status-badge */
  badge(book: AdminBook): { status: string; label: string } {
    const threshold = this.data()?.lowStockThreshold ?? 5;
    if (book.status === 'hidden') return { status: 'hidden', label: 'Đã ẩn' };
    if (book.stock <= 0) return { status: 'out_of_stock', label: 'Hết hàng' };
    if (book.stock <= threshold) return { status: 'low_stock', label: 'Sắp hết' };
    return { status: 'active', label: 'Đang bán' };
  }

  stockClass(book: AdminBook): string {
    const threshold = this.data()?.lowStockThreshold ?? 5;
    return book.stock <= 0 ? 'stock-out' : book.stock <= threshold ? 'stock-low' : '';
  }

  hideCover(event: Event): void {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }

  private showFlash(message: string): void {
    this.flash.set(message);
    setTimeout(() => this.flash() === message && this.flash.set(''), 4000);
  }

  private fail(message: string): void {
    this.working.set(false);
    this.error.set(message);
  }
}
