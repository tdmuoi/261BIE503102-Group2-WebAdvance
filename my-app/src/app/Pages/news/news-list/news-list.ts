import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { NewsItem } from '../../../models/content';
import { NewsService } from '../../../services/news-service';
import { categoryLabel } from '../../../shared/news-utils';

/** Mỗi lần tải: 3 hàng × 3 cột */
const PAGE_SIZE = 9;
/** Số bài trong khối "Đọc nhiều" */
const MOST_READ = 4;

/** Trang Lightbook News /news — query params: category, q */
@Component({
  selector: 'app-news-list',
  standalone: false,
  styleUrl: './news-list.css',
  templateUrl: './news-list.html',
})
export class NewsList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly newsService = inject(NewsService);

  protected readonly crumbs = [{ label: 'Trang chủ', link: '/' }, { label: 'Lightbook News' }];
  protected readonly categoryLabel = categoryLabel;

  /** Bài mới nhất + "Đọc nhiều" + chuyên mục: không phụ thuộc bộ lọc */
  protected readonly featured = signal<NewsItem | null>(null);
  protected readonly mostRead = signal<NewsItem[]>([]);
  protected readonly categories = signal<string[]>([]);
  protected readonly publishedTotal = signal(0);

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly items = signal<NewsItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loadingMore = signal(false);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => ({ category: this.params().get('category') ?? '', q: this.params().get('q') ?? '' }));
  protected readonly hasFilter = computed(() => !!(this.query().category || this.query().q.trim()));

  /** Lưới bỏ bài nổi bật khi không lọc (bài đó đã hiện ở trên) */
  protected readonly gridItems = computed(() => {
    const featuredId = this.featured()?._id;
    return this.hasFilter() ? this.items() : this.items().filter((item) => item._id !== featuredId);
  });
  protected readonly remaining = computed(() => Math.max(this.total() - this.items().length, 0));

  constructor() {
    this.loadTop();

    toObservable(this.query)
      .pipe(
        map((q) => ({ category: q.category, q: q.q.trim() })),
        distinctUntilChanged((a, b) => a.category === b.category && a.q === b.q),
        debounceTime(250),
        tap(() => this.status.set('loading')),
        switchMap((q) =>
          this.newsService.getNews({ category: q.category, search: q.q, limit: PAGE_SIZE }).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        if (!page) return this.status.set('error');
        this.items.set(page.items);
        this.total.set(page.total);
        this.status.set('ready');
      });
  }

  /** Bài nổi bật, bảng "Đọc nhiều" và danh sách chuyên mục — lỗi thì chỉ ẩn các khối này */
  private loadTop(): void {
    this.newsService.getNews({ limit: 1 }).subscribe({
      next: (page) => {
        this.featured.set(page.items[0] ?? null);
        this.categories.set(page.categories);
        this.publishedTotal.set(page.total);
      },
      error: () => this.featured.set(null),
    });
    // Chỉ xếp hạng bài đã có lượt xem; chưa bài nào có thì ẩn khối
    this.newsService.getNews({ sort: 'popular', limit: MOST_READ }).subscribe({
      next: (page) => this.mostRead.set(page.items.filter((item) => (item.views ?? 0) > 0)),
      error: () => this.mostRead.set([]),
    });
  }

  protected retry(): void {
    this.status.set('loading');
    const { category, q } = this.query();
    this.newsService.getNews({ category, search: q.trim(), limit: PAGE_SIZE }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  protected loadMore(): void {
    const { category, q } = this.query();
    this.loadingMore.set(true);
    this.newsService.getNews({ category, search: q.trim(), limit: PAGE_SIZE, skip: this.items().length }).subscribe({
      next: (page) => {
        this.items.update((list) => [...list, ...page.items]);
        this.total.set(page.total);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected update(patch: Params): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: patch, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected clearFilters(): void {
    this.update({ category: null, q: null });
  }
}
