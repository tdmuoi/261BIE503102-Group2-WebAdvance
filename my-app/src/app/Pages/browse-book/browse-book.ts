import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { Catalog } from '../../models/book';
import { VndPipe } from '../../pipes/vnd-pipe';
import { BookService } from '../../services/book-service';
import {
  BrowseQuery,
  PAGE_SIZE,
  SORT_OPTIONS,
  TYPE_LABELS,
  BrowseSort,
  booksOfType,
  filterBooks,
  parseQuery,
  sortBooks,
  toParams,
} from './browse-query';
import { EmptyTip } from './sections/browse-empty/browse-empty';
import { AuthorFacet, FilterChange } from './sections/browse-filters/browse-filters';

type LoadState = 'loading' | 'ready' | 'error';

interface Chip {
  slug: string | null;
  label: string;
}

/** Một bộ lọc đang áp dụng: hiện thành chip "Đang lọc" và thành gợi ý khi không có kết quả */
interface ActiveFilter extends EmptyTip {
  tip: string;
  patch: Partial<BrowseQuery>;
}

/** Thể loại không hiện thành chip: chưa phân loại và 2 thể loại dùng để đánh dấu loại sách */
const HIDDEN_CATEGORY_SLUGS = ['uncategorized', 'used-book', 'ebook'];
const SUGGESTION_COUNT = 4;
const vnd = new VndPipe();

/** Trang Browse Books — /books?type=new|used|ebook (Figma 892:8446) */
@Component({
  selector: 'app-browse-book',
  standalone: false,
  styleUrl: './browse-book.css',
  templateUrl: './browse-book.html',
  host: { '(document:keydown.escape)': 'filtersOpen.set(false)' },
})
export class BrowseBook {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookService = inject(BookService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly resultsTop = viewChild<ElementRef<HTMLElement>>('resultsTop');

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly typeLabels = TYPE_LABELS;
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  protected readonly state = signal<LoadState>('loading');
  private readonly catalog = signal<Catalog | null>(null);
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseQuery)), { requireSync: true });
  /** Drawer bộ lọc trên tablet/mobile */
  protected readonly filtersOpen = signal(false);

  /** Sách thuộc loại đang xem, chưa áp các bộ lọc khác */
  protected readonly scope = computed(() => booksOfType(this.catalog()?.books ?? [], this.query().type));

  protected readonly results = computed(() => filterBooks(this.catalog()?.books ?? [], this.query()));
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.results().length / PAGE_SIZE)));
  /** URL ghi trang quá số trang thật thì hiện trang cuối */
  protected readonly page = computed(() => Math.min(this.query().page, this.totalPages()));
  protected readonly pageBooks = computed(() =>
    this.results().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE),
  );

  /** "Tất cả" + các thể loại đang có sách, nhiều sách đứng trước */
  protected readonly chips = computed<Chip[]>(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const book of this.scope()) {
      if (HIDDEN_CATEGORY_SLUGS.includes(book.categorySlug)) continue;
      const entry = counts.get(book.categorySlug) ?? { label: book.categoryName, count: 0 };
      entry.count++;
      counts.set(book.categorySlug, entry);
    }
    const chips = [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([slug, entry]) => ({ slug, label: entry.label }));
    // Thể loại chọn từ trang chủ nhưng chưa có sách vẫn hiện để thấy đang lọc gì
    const selected = this.query().category;
    if (selected && !counts.has(selected)) chips.push({ slug: selected, label: this.categoryName(selected) });
    return [{ slug: null, label: 'Tất cả' }, ...chips];
  });

  /** Tác giả trong loại + thể loại đang xem, kèm số đầu sách */
  protected readonly authorFacets = computed<AuthorFacet[]>(() => {
    const category = this.query().category;
    const facets = new Map<string, AuthorFacet>();
    for (const book of this.scope()) {
      if (!book.authorId || (category && book.categorySlug !== category)) continue;
      const facet = facets.get(book.authorId) ?? { id: book.authorId, name: book.authorName, count: 0 };
      facet.count++;
      facets.set(book.authorId, facet);
    }
    return [...facets.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  });

  protected readonly activeFilters = computed<ActiveFilter[]>(() => {
    const query = this.query();
    const filters: ActiveFilter[] = [];
    if (query.category) {
      const label = this.categoryName(query.category);
      filters.push({ id: 'category', label, tip: 'Đổi thể loại về Tất cả', patch: { category: null } });
    }
    for (const id of query.authors) {
      const label = this.authorName(id);
      filters.push({ id: `author:${id}`, label, tip: `Bỏ chọn “${label}”`, patch: { authors: query.authors.filter((a) => a !== id) } });
    }
    if (query.minPrice !== null || query.maxPrice !== null) {
      const label = `${vnd.transform(query.minPrice ?? 0)} – ${query.maxPrice === null ? 'trở lên' : vnd.transform(query.maxPrice)}`;
      filters.push({ id: 'price', label, tip: 'Bỏ lọc giá', patch: { minPrice: null, maxPrice: null } });
    }
    if (query.q) {
      filters.push({ id: 'q', label: `“${query.q}”`, tip: `Bỏ tìm “${query.q}”`, patch: { q: '' } });
    }
    if (query.sale) {
      filters.push({ id: 'sale', label: 'Đang giảm giá', tip: 'Bỏ chọn “Đang giảm giá”', patch: { sale: false } });
    }
    return filters;
  });

  protected readonly emptyTips = computed<EmptyTip[]>(() =>
    this.activeFilters().slice(0, 3).map((filter) => ({ id: filter.id, label: filter.tip })),
  );

  /** "248 sách mới · Văn học · hiển thị 1–24" */
  protected readonly summary = computed(() => {
    const total = this.results().length;
    if (!total) return 'sách phù hợp';
    const type = this.query().type;
    const parts = [type ? TYPE_LABELS[type].toLowerCase() : 'đầu sách'];
    if (this.query().category) parts.push(this.categoryName(this.query().category!));
    const from = (this.page() - 1) * PAGE_SIZE + 1;
    parts.push(`hiển thị ${from}–${from + this.pageBooks().length - 1}`);
    return parts.join(' · ');
  });

  /** Sách mới nhất (mọi loại) để gợi ý khi không có kết quả */
  protected readonly suggestions = computed(() =>
    sortBooks(this.catalog()?.books ?? [], 'newest').slice(0, SUGGESTION_COUNT),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.bookService
      .getCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(catalog);
          this.state.set('ready');
        },
        error: (error) => {
          console.error('Không tải được danh sách sách:', error);
          this.state.set('error');
        },
      });
  }

  protected selectCategory(slug: string | null): void {
    this.update({ category: slug });
  }

  protected onSort(event: Event): void {
    this.update({ sort: (event.target as HTMLSelectElement).value as BrowseSort });
  }

  protected goToPage(page: number): void {
    this.update({ page });
  }

  protected applyFilters(change: FilterChange): void {
    this.update(change);
  }

  protected removeFilter(id: string): void {
    const filter = this.activeFilters().find((item) => item.id === id);
    if (filter) this.update(filter.patch);
  }

  /** Bỏ mọi bộ lọc, giữ loại sách và cách sắp xếp */
  protected clearFilters(): void {
    this.update({ category: null, authors: [], minPrice: null, maxPrice: null, q: '', sale: false });
  }

  /** Ghi bộ lọc mới lên URL (đổi bộ lọc thì về trang 1) rồi cuộn về đầu kết quả */
  private update(patch: Partial<BrowseQuery>): void {
    const next: BrowseQuery = { ...this.query(), page: 1, ...patch };
    this.filtersOpen.set(false);
    this.router.navigate([], { relativeTo: this.route, queryParams: toParams(next) }).then((navigated) => {
      // Router tự cuộn lên đầu trang sau mỗi lần điều hướng (scrollPositionRestoration: 'top'),
      // nên chờ nó xong rồi mới cuộn tới phần kết quả
      if (navigated) setTimeout(() => this.resultsTop()?.nativeElement.scrollIntoView({ block: 'start' }));
    });
  }

  private categoryName(slug: string): string {
    return this.catalog()?.categories.find((category) => category.slug === slug)?.name ?? slug;
  }

  private authorName(id: string): string {
    return this.authorFacets().find((author) => author.id === id)?.name
      ?? this.catalog()?.authors.find((author) => author._id === id)?.name
      ?? 'Tác giả';
  }
}
