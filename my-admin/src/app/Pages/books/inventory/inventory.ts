import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { EMPTY, Subscription, expand, reduce, timeout, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { BookService } from '../../../services/book-service';
import { AdminAuthService } from '../../../services/admin-auth-service';
import { AdminBook, BookListResponse } from '../../../models/book';

type StockFilter = 'all' | 'in' | 'low' | 'out';
interface InventoryBook extends AdminBook {
  sku?: string;
  location?: string;
  warehouse?: string;
  stockThreshold?: number;

}

@Component({
  selector: 'app-inventory',
  standalone: false,
  styleUrl: './inventory.css',
  templateUrl: './inventory.html',
})
export class Inventory implements OnInit, OnDestroy {
  private books = inject(BookService);
  private auth = inject(AdminAuthService);
  private request?: Subscription;
  readonly rows = signal<InventoryBook[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly query = signal('');
  readonly filter = signal<StockFilter>('all');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly defaultThreshold = signal(0);
  readonly excludedEbooks = signal(0);
  readonly loadedAt = signal<Date | null>(null);
  readonly dialogOpen = signal(false);
  readonly dialogTitle = signal('');
  readonly dialogMessage = signal('');
  readonly tabs: { id: StockFilter; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'in', label: 'Còn hàng' },
    { id: 'low', label: 'Sắp hết' },
    { id: 'out', label: 'Hết hàng' },
  ];
  readonly summary = computed(() => {
    let total = 0,
      unknown = 0,
      low = 0,
      out = 0;
    for (const row of this.rows()) {
      const stock = this.stock(row);
      if (stock === null) unknown++;
      else {
        total += stock;
        if (stock === 0) out++;
        else if (stock <= this.threshold(row)) low++;
      }
    }
    return { total: unknown ? null : total, unknown, low, out, titles: this.rows().length };
  });
  readonly matching = computed(() => {
    const q = this.query().trim().toLocaleLowerCase('vi');
    return this.rows().filter(
      (row) =>
        !q ||
        [row.title, row.authorName, row.sku, row.isbn].some(
          (v) => typeof v === 'string' && v.toLocaleLowerCase('vi').includes(q),
        ),
    );
  });
  readonly filtered = computed(() =>
    this.matching().filter((row) => this.filter() === 'all' || this.status(row) === this.filter()),
  );
  readonly visible = computed(() =>
    this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize),
  );
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
  }
  load() {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loaded.set(false);
    this.error.set('');
    this.rows.set([]);
    this.page.set(1);
    let expectedTotal: number | undefined;
    let threshold: number | undefined;
    let previousPage = 0;
    const fetchPage = (page: number) =>
      this.auth
        .withSession(() => {
          const user = this.auth.user;
          if (
            user?.role !== 'superadmin' &&
            !user?.permissions?.some((p) => p.module === 'inventory' && p.actions.includes('view'))
          )
            return throwError(() => new Error('Tài khoản chưa có quyền xem tồn kho.'));
          return this.books.getInventory({ page, limit: 100, sort: 'title' });
        })
        .pipe(timeout(15000));
    this.request = fetchPage(1)
      .pipe(
        expand((response) => {
          if (response.page !== previousPage + 1)
            throw new Error('API trả sai thứ tự trang. Vui lòng tải lại.');
          previousPage = response.page;
          if (
            !Number.isSafeInteger(response.total) ||
            response.total < 0 ||
            response.total > 10000 ||
            response.page < 1 ||
            response.limit < 1 ||
            !Array.isArray(response.items) ||
            !Number.isSafeInteger(response.lowStockThreshold) ||
            response.lowStockThreshold < 0
          )
            throw new Error('Dữ liệu kho không hợp lệ hoặc vượt 10.000 đầu sách.');
          if (expectedTotal === undefined) {
            expectedTotal = response.total;
            threshold = response.lowStockThreshold;
          }
          if (response.total !== expectedTotal || response.lowStockThreshold !== threshold)
            throw new Error('Danh sách sách đã thay đổi khi tải. Vui lòng tải lại.');
          if (response.page * response.limit < response.total) {
            if (!response.items.length) throw new Error('API trả thiếu dữ liệu tồn kho.');
            return fetchPage(response.page + 1);
          }
          return EMPTY;
        }),
        reduce((all: AdminBook[], response: BookListResponse) => [...all, ...response.items], []),
        timeout(45000),
      )
      .subscribe({
        next: (all) => {
          if (
            all.length !== expectedTotal ||
            new Set(all.map((row) => row._id)).size !== all.length
          ) {
            this.fail('Danh sách thay đổi khi tải. Hãy tải lại để nhận dữ liệu đầy đủ.');
            return;
          }
          const items = all as InventoryBook[];
          const physical = items.filter((row) => row.bookType !== 'ebook');
          this.rows.set(physical);
          this.excludedEbooks.set(items.length - physical.length);
          this.defaultThreshold.set(threshold!);
          this.loadedAt.set(new Date());
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: (e) =>
          this.fail(
            e instanceof HttpErrorResponse
              ? e.status === 401
                ? 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
                : e.status === 403
                  ? 'Chưa có quyền xem tồn kho.'
                  : e.status === 0
                    ? 'Không kết nối được backend.'
                    : e.error?.message || 'Không tải được tồn kho.'
              : e.name === 'TimeoutError'
                ? 'Backend phản hồi quá lâu. Hãy thử lại.'
                : e.message || 'Không tải được tồn kho.',
          ),
      });
  }
  private fail(message: string) {
    this.error.set(message);
    this.rows.set([]);
    this.loading.set(false);
    this.loaded.set(false);
  }
  stock(row: InventoryBook): number | null {
    return Number.isSafeInteger(row.stock) && row.stock >= 0 ? row.stock : null;
  }
  threshold(row: InventoryBook): number {
    return Number.isSafeInteger(row.stockThreshold) && row.stockThreshold! >= 0
      ? row.stockThreshold!
      : this.defaultThreshold();
  }
  status(row: InventoryBook): StockFilter | 'unknown' {
    const stock = this.stock(row);
    return stock === null
      ? 'unknown'
      : stock === 0
        ? 'out'
        : stock <= this.threshold(row)
          ? 'low'
          : 'in';
  }
  statusLabel(row: InventoryBook) {
    return {
      in: 'Còn hàng',
      low: 'Sắp hết',
      out: 'Hết hàng',
      unknown: 'Chưa có dữ liệu',
      all: 'Tất cả',
    }[this.status(row)];
  }
  statusTone(row: InventoryBook): 'ok' | 'warn' | 'bad' | 'mute' {
    return this.status(row) === 'out'
      ? 'bad'
      : this.status(row) === 'low'
        ? 'warn'
        : this.status(row) === 'in'
          ? 'ok'
          : 'mute';
  }
  count(filter: StockFilter) {
    return filter === 'all'
      ? this.matching().length
      : this.matching().filter((row) => this.status(row) === filter).length;
  }
  search(value: string) {
    this.query.set(value);
    this.page.set(1);
  }
  setFilter(value: StockFilter) {
    this.filter.set(value);
    this.page.set(1);
  }
  goToPage(page: number) {
    this.page.set(
      Math.max(1, Math.min(page, Math.max(1, Math.ceil(this.filtered().length / this.pageSize)))),
    );
  }
  stockIn(row?: InventoryBook) {
    this.dialogTitle.set(row ? 'Nhập thêm · ' + row.title : 'Tạo phiếu nhập kho');
    this.dialogMessage.set(
      'Chưa có API tạo phiếu nhập và cập nhật tồn kho kèm nhật ký. Chưa lưu phiếu hoặc thay đổi số lượng sách.',
    );
    this.dialogOpen.set(true);
  }
  bulkStockIn() {
    this.dialogTitle.set('Nhập hàng loạt');
    this.dialogMessage.set(
      'Chưa có chức năng nhập kho hàng loạt. Danh sách cảnh báo chỉ dùng để theo dõi; chưa có số lượng nào được thay đổi.',
    );
    this.dialogOpen.set(true);
  }
  showHistory() {
    this.dialogTitle.set('Lịch sử nhập / xuất kho');
    this.dialogMessage.set(
      'Backend chưa có API lịch sử kho. Không tạo phiếu hoặc lịch sử mẫu để thay thế dữ liệu thật.',
    );
    this.dialogOpen.set(true);
  }
  exportCsv() {
    if (!this.loaded() || this.loading()) return;
    const lines: unknown[][] = [
      ['Sản phẩm', 'Tác giả', 'SKU', 'Vị trí', 'Tồn', 'Ngưỡng', 'Trạng thái', 'Cập nhật'],
      ...this.filtered().map((row) => [
        row.title,
        row.authorName,
        row.sku || '',
        row.location || '',
        this.stock(row) ?? '',
        this.threshold(row),
        this.statusLabel(row),
        row.updatedAt || '',
      ]),
    ];
    const cell = (v: unknown) =>
      '"' +
      String(v ?? '')
        .replace(/^[\s]*[=+@-]|^[\t\r]/, (m) => "'" + m)
        .replaceAll('"', '""') +
      '"';
    const blob = new Blob(['\uFEFF' + lines.map((row) => row.map(cell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lightbook-ton-kho.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
