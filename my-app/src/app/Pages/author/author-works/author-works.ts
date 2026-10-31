import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { BookType } from '../../../models/book';
import { AuthorDirectoryService, AuthorProfile } from '../../../services/author-directory-service';

type WorkSort = 'newest' | 'price-asc' | 'price-desc' | 'title';

const TYPE_LABELS: Record<BookType, string> = { new: 'Sách mới', used: 'Sách cũ', ebook: 'Ebook' };

/** Khoảng giá (VNĐ) — max null là không giới hạn */
const PRICE_RANGES = [
  { key: 'under-100', label: 'Dưới 100.000đ', min: 0, max: 100_000 },
  { key: '100-200', label: '100.000đ – 200.000đ', min: 100_000, max: 200_000 },
  { key: '200-300', label: '200.000đ – 300.000đ', min: 200_000, max: 300_000 },
  { key: 'over-300', label: 'Trên 300.000đ', min: 300_000, max: null },
];

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

/** Tất cả tác phẩm của một tác giả /authors/:id/works — query params: genre, type, price, q, sort */
@Component({
  selector: 'app-author-works',
  standalone: false,
  styleUrls: ['../author-filters.css', './author-works.css'],
  templateUrl: './author-works.html',
})
export class AuthorWorks {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly directory = inject(AuthorDirectoryService);

  protected readonly status = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly author = signal<AuthorProfile | null>(null);
  protected readonly priceRanges = PRICE_RANGES;
  protected readonly typeLabels = TYPE_LABELS;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly retry$ = new BehaviorSubject(0);

  protected readonly query = computed(() => {
    const p = this.params();
    const sort = p.get('sort') as WorkSort | null;
    return {
      genre: p.get('genre') ?? '',
      type: (p.get('type') ?? '') as BookType | '',
      price: p.get('price') ?? '',
      q: p.get('q') ?? '',
      sort: sort && ['price-asc', 'price-desc', 'title'].includes(sort) ? sort : ('newest' as WorkSort),
    };
  });

  protected readonly crumbs = computed(() => {
    const a = this.author();
    return [
      { label: 'Trang chủ', link: '/' },
      { label: 'Tác giả', link: '/authors' },
      { label: a?.name ?? '', link: a ? ['/authors', a.id] : undefined },
      { label: 'Tất cả tác phẩm' },
    ];
  });

  /** Font serif của accent chỉ có chữ Latin không dấu — tên có dấu thì dùng font thường nghiêng */
  protected readonly plainName = computed(() => /^[\x20-\x7E]*$/.test(this.author()?.name ?? ''));

  /** Loại sách thực tế có trong các tác phẩm */
  protected readonly types = computed(() => {
    const present = new Set((this.author()?.books ?? []).map((b) => b.type));
    return (Object.keys(TYPE_LABELS) as BookType[]).filter((t) => present.has(t));
  });

  protected readonly results = computed(() => {
    const { genre, type, price, q, sort } = this.query();
    const range = PRICE_RANGES.find((r) => r.key === price);
    const needle = fold(q.trim());
    const list = (this.author()?.books ?? []).filter(
      (b) =>
        (!genre || b.categoryName === genre) &&
        (!type || b.type === type) &&
        (!range || (b.price >= range.min && (range.max === null || b.price < range.max))) &&
        (!needle || fold(b.title).includes(needle)),
    );
    const sorted = [...list];
    if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    else sorted.sort((a, b) => (b.publishYear ?? 0) - (a.publishYear ?? 0) || b.createdAt.localeCompare(a.createdAt));
    return sorted;
  });

  /** Chip bộ lọc đang áp dụng — bấm x để bỏ */
  protected readonly activeFilters = computed(() => {
    const { genre, type, price, q } = this.query();
    const chips: { label: string; patch: Params }[] = [];
    if (genre) chips.push({ label: genre, patch: { genre: null } });
    if (type) chips.push({ label: TYPE_LABELS[type], patch: { type: null } });
    if (price) chips.push({ label: PRICE_RANGES.find((r) => r.key === price)?.label ?? price, patch: { price: null } });
    if (q) chips.push({ label: `“${q}”`, patch: { q: null } });
    return chips;
  });

  protected readonly updatedAt = computed(() => {
    const iso = this.author()?.updatedAt;
    return iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  });

  constructor() {
    combineLatest([this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), this.retry$])
      .pipe(
        tap(() => this.status.set('loading')),
        // undefined = lỗi tải, null = không có tác giả này
        switchMap(([id]) => this.directory.getProfile(id).pipe(catchError(() => of(undefined)))),
        takeUntilDestroyed(),
      )
      .subscribe((author) => {
        if (author === undefined) return this.status.set('error');
        if (!author) return this.status.set('missing');
        this.author.set(author);
        this.status.set('ready');
      });
  }

  protected reload(): void {
    this.retry$.next(this.retry$.value + 1);
  }

  protected update(patch: Params): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: patch, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected clearFilters(): void {
    this.update({ genre: null, type: null, price: null, q: null });
  }
}
