import { Component, computed, input, output } from '@angular/core';

/** Số trang hoặc dấu "…" */
type PageItem = number | 'gap';

/** Phân trang tròn — Figma "Pagination" (893:9969): ‹ 1 2 3 … 21 › */
@Component({
  selector: 'app-pagination',
  standalone: false,
  styleUrl: './pagination.css',
  templateUrl: './pagination.html',
})
export class Pagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();

  readonly pageChange = output<number>();

  /** Luôn có trang đầu, trang cuối và 1 trang mỗi bên trang hiện tại */
  protected readonly items = computed<PageItem[]>(() => {
    const total = this.totalPages();
    const current = this.page();
    const pages = new Set([1, total, current - 1, current, current + 1]);
    // Gần đầu/cuối thì hiện đủ 3 trang liền nhau như Figma
    if (current <= 2) pages.add(3);
    if (current >= total - 1) pages.add(total - 2);

    const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const items: PageItem[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) items.push('gap');
      items.push(p);
    });
    return items;
  });

  protected go(page: number): void {
    if (page >= 1 && page <= this.totalPages() && page !== this.page()) this.pageChange.emit(page);
  }
}
