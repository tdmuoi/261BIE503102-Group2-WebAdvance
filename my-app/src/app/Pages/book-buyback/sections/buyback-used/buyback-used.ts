import { Component, computed, input, output, signal } from '@angular/core';

import { CatalogBook } from '../../../../models/book';
import { PRICE_TIERS } from '../../buyback-rules';

type SortKey = 'newest' | 'price-asc' | 'price-desc';

interface Chip {
  id: string;
  label: string;
  test: (book: CatalogBook) => boolean;
}

const PAGE_SIZE = 10;
const CHEAP_PRICE = 50_000;
const CATEGORY_CHIPS = 3;

/** Thể loại dùng để đánh dấu loại sách, không hiện thành chip */
const HIDDEN_CATEGORY_SLUGS = ['uncategorized', 'used-book', 'ebook'];

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Mới lên kệ' },
  { value: 'price-asc', label: 'Giá thấp đến cao' },
  { value: 'price-desc', label: 'Giá cao đến thấp' },
];

/** "Sách thanh lý second chances" — Figma 837:3517 */
@Component({
  selector: 'app-buyback-used',
  standalone: false,
  styleUrls: ['../../../homepage/sections/section-shared.css', './buyback-used.css'],
  templateUrl: './buyback-used.html',
})
export class BuybackUsed {
  /** Sách cũ đang bán (loại "used") */
  readonly books = input<CatalogBook[]>([]);
  readonly state = input<'loading' | 'ready' | 'error'>('loading');
  readonly retry = output<void>();

  protected readonly sorts = SORTS;
  protected readonly skeletons = Array.from({ length: 5 }, (_, i) => i);

  protected readonly chipId = signal('all');
  protected readonly sort = signal<SortKey>('newest');
  protected readonly visible = signal(PAGE_SIZE);

  /**
   * Chip lọc sinh từ dữ liệu thật: hạng tình trạng (chỉ khi sách có field condition),
   * "Dưới 50.000đ" và các thể loại có nhiều sách cũ nhất.
   */
  protected readonly chips = computed<Chip[]>(() => {
    const books = this.books();
    const chips: Chip[] = [{ id: 'all', label: 'Tất cả', test: () => true }];

    for (const tier of PRICE_TIERS) {
      if (books.some((book) => book.condition === tier.grade)) {
        chips.push({ id: tier.grade, label: tier.label, test: (book) => book.condition === tier.grade });
      }
    }
    if (books.some((book) => book.price < CHEAP_PRICE)) {
      chips.push({ id: 'cheap', label: 'Dưới 50.000đ', test: (book) => book.price < CHEAP_PRICE });
    }

    const counts = new Map<string, { label: string; count: number }>();
    for (const book of books) {
      if (!book.categorySlug || HIDDEN_CATEGORY_SLUGS.includes(book.categorySlug)) continue;
      const entry = counts.get(book.categorySlug) ?? { label: book.categoryName, count: 0 };
      entry.count++;
      counts.set(book.categorySlug, entry);
    }
    [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, CATEGORY_CHIPS)
      .forEach(([slug, { label }]) => chips.push({ id: `cat-${slug}`, label, test: (book) => book.categorySlug === slug }));

    return chips;
  });

  protected readonly results = computed(() => {
    const chip = this.chips().find((item) => item.id === this.chipId()) ?? this.chips()[0];
    const list = this.books().filter(chip.test);
    switch (this.sort()) {
      case 'price-asc':
        return list.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return list.sort((a, b) => b.price - a.price);
      default:
        return list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    }
  });

  protected readonly shown = computed(() => this.results().slice(0, this.visible()));

  protected selectChip(id: string): void {
    this.chipId.set(id);
    this.visible.set(PAGE_SIZE);
  }

  protected onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as SortKey);
    this.visible.set(PAGE_SIZE);
  }

  protected showMore(): void {
    this.visible.update((count) => count + PAGE_SIZE);
  }
}
