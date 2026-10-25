import { Component, computed, input, linkedSignal, signal } from '@angular/core';

import { BookView } from '../../../../models/book';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'discount';

interface Chip {
  id: string;
  label: string;
}

const PAGE_SIZE = 15;
const ALL = 'all';

@Component({
  selector: 'app-home-recommendations',
  standalone: false,
  styleUrls: ['../section-shared.css', './home-recommendations.css'],
  templateUrl: './home-recommendations.html',
})
export class HomeRecommendations {
  readonly books = input.required<BookView[]>();

  protected readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'discount', label: 'Giảm nhiều nhất' },
    { value: 'price-asc', label: 'Giá thấp đến cao' },
    { value: 'price-desc', label: 'Giá cao đến thấp' },
  ];

  protected readonly activeChip = signal(ALL);
  protected readonly sort = signal<SortKey>('newest');

  /** "Tất cả" + các thể loại đang có sách, thể loại nhiều sách đứng trước */
  protected readonly chips = computed<Chip[]>(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const book of this.books()) {
      if (!book.categoryId) continue;
      const entry = counts.get(book.categoryId) ?? { label: book.categoryName, count: 0 };
      entry.count++;
      counts.set(book.categoryId, entry);
    }
    const categories = [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, entry]) => ({ id, label: entry.label }));
    return [{ id: ALL, label: 'Tất cả' }, ...categories];
  });

  private readonly filtered = computed(() => {
    const chip = this.activeChip();
    const list = chip === ALL ? [...this.books()] : this.books().filter((book) => book.categoryId === chip);
    switch (this.sort()) {
      case 'price-asc':
        return list.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return list.sort((a, b) => b.price - a.price);
      case 'discount':
        return list.sort((a, b) => b.discountPercent - a.discountPercent);
      default:
        return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
  });

  /** Số sách đang hiện; đổi bộ lọc thì quay về 15 cuốn đầu */
  protected readonly visibleCount = linkedSignal({ source: this.filtered, computation: () => PAGE_SIZE });

  protected readonly visible = computed(() => this.filtered().slice(0, this.visibleCount()));

  protected readonly remaining = computed(() => Math.max(0, this.filtered().length - this.visibleCount()));

  protected selectChip(id: string): void {
    this.activeChip.set(id);
  }

  protected onSortChange(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as SortKey);
  }

  protected showMore(): void {
    this.visibleCount.update((count) => count + PAGE_SIZE);
  }
}
