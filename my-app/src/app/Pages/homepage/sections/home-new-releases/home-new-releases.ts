import { Component, computed, input, linkedSignal } from '@angular/core';

import { BookView } from '../../../../models/book';

/** Mỗi trang: 1 sách nổi bật + 3 sách nhỏ */
const PAGE_SIZE = 4;
const MAX_PAGES = 3;

@Component({
  selector: 'app-home-new-releases',
  standalone: false,
  styleUrls: ['../section-shared.css', './home-new-releases.css'],
  templateUrl: './home-new-releases.html',
})
export class HomeNewReleases {
  readonly books = input.required<BookView[]>();

  /** Sách mới nhất theo ngày tạo, đủ cho tối đa 3 trang */
  private readonly newest = computed(() =>
    [...this.books()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, PAGE_SIZE * MAX_PAGES),
  );

  /** Trang đang xem; tự quay về trang đầu khi dữ liệu đổi */
  protected readonly page = linkedSignal({ source: this.books, computation: () => 0 });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.newest().length / PAGE_SIZE)));

  private readonly pageBooks = computed(() => {
    const start = this.page() * PAGE_SIZE;
    return this.newest().slice(start, start + PAGE_SIZE);
  });

  protected readonly featured = computed<BookView | undefined>(() => this.pageBooks()[0]);
  protected readonly others = computed(() => this.pageBooks().slice(1));

  protected prev(): void {
    this.page.update((p) => Math.max(0, p - 1));
  }

  protected next(): void {
    this.page.update((p) => Math.min(this.pageCount() - 1, p + 1));
  }
}
