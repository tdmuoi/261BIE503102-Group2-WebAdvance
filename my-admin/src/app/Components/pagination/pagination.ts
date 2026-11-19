import { Component, EventEmitter, Input, Output } from '@angular/core';

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

  get pages(): PageItem[] {
    const total = this.totalPages;
    const cur = this.current;
    const s = Math.max(0, this.siblings);
    const width = 3 + s * 2;
    const range = (from: number, length: number) => Array.from({ length }, (_, i) => from + i);

    if (total <= width + 2) return range(1, total);

    if (cur - s <= 3) return [...range(1, width), '...', total];

    if (cur + s >= total - 2) return [1, '...', ...range(total - width + 1, width)];

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
