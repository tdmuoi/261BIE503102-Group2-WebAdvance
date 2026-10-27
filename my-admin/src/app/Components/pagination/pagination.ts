import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Phân trang cho các bảng admin: "Hiển thị 1–10 trong 2.486 sản phẩm"  ‹ 1 2 3 … 42 ›
 *
 * Cách dùng:
 *   <app-pagination
 *     [page]="page" [pageSize]="10" [total]="totalBooks" itemLabel="sản phẩm"
 *     (pageChange)="page = $event; loadBooks()">
 *   </app-pagination>
 *
 * - page bắt đầu từ 1.
 * - Lấy dữ liệu của trang hiện tại ở frontend:  list.slice((page - 1) * pageSize, page * pageSize)
 *   hoặc gửi ?page=&limit= lên API nếu backend có phân trang.
 */
export type PageItem = number | '...';

@Component({
  selector: 'app-pagination',
  standalone: false,
  styleUrl: './pagination.css',
  templateUrl: './pagination.html',
})
export class Pagination {
  @Input() page = 1;
  @Input() pageSize = 10;
  @Input() total = 0;
  @Input() itemLabel = 'mục';
  /** Số trang hiển thị hai bên trang hiện tại (1 -> "1 … 4 5 6 … 42") */
  @Input() siblings = 1;

  @Output() pageChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / Math.max(1, this.pageSize)));
  }

  get current(): number {
    return Math.min(Math.max(1, this.page || 1), this.totalPages);
  }

  get from(): number {
    return this.total === 0 ? 0 : (this.current - 1) * this.pageSize + 1;
  }

  get to(): number {
    return Math.min(this.current * this.pageSize, this.total);
  }

  /** Danh sách nút trang, có dấu "…" khi nhiều trang */
  get pages(): PageItem[] {
    const total = this.totalPages;
    const cur = this.current;
    const s = Math.max(0, this.siblings);
    const width = 3 + s * 2; // số nút liền nhau ở dải chính (siblings = 1 -> 5 nút)
    const range = (from: number, length: number) => Array.from({ length }, (_, i) => from + i);

    // Ít trang: hiện hết, không cần "…"
    if (total <= width + 2) return range(1, total);

    // Gần đầu:   1 2 3 4 5 … 42
    if (cur - s <= 3) return [...range(1, width), '...', total];

    // Gần cuối:  1 … 38 39 40 41 42
    if (cur + s >= total - 2) return [1, '...', ...range(total - width + 1, width)];

    // Ở giữa:    1 … 19 20 21 … 42
    return [1, '...', ...range(cur - s, s * 2 + 1), '...', total];
  }

  goTo(p: PageItem): void {
    if (p === '...') return;
    const target = Math.min(Math.max(1, p), this.totalPages);
    if (target !== this.current) this.pageChange.emit(target);
  }

  formatNumber(n: number): string {
    return n.toLocaleString('vi-VN');
  }
}
