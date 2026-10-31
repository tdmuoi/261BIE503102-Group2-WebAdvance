import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { Catalog } from '../../../models/book';
import { NewsItem } from '../../../models/content';
import { BookService } from '../../../services/book-service';
import { toInitials } from '../../../services/author-directory-service';
import { NewsService } from '../../../services/news-service';
import { Crumb } from '../../../Components/breadcrumb/breadcrumb';
import { categoryLabel, fallbackCover, fold, mentionedBooks, newsCover, newsDate } from '../../../shared/news-utils';
import { TopicChip } from './article-tags/article-tags';

/** Tiêu đề rút gọn trên breadcrumb */
const CRUMB_TITLE_MAX = 48;
const RELATED_COUNT = 3;
const MAX_CHIPS = 6;

/** Chi tiết bài viết /news/:id (id = _id của bài) */
@Component({
  selector: 'app-news-detail',
  standalone: false,
  styleUrl: './news-detail.css',
  templateUrl: './news-detail.html',
})
export class NewsDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly newsService = inject(NewsService);
  private readonly bookService = inject(BookService);

  protected readonly status = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly article = signal<NewsItem | null>(null);
  /** Sách + tác giả thật để tìm "Sách được nhắc đến"; lỗi thì null (ẩn các mục đó) */
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly related = signal<NewsItem[]>([]);
  private readonly coverFailed = signal(false);
  private readonly retry$ = new BehaviorSubject(0);

  protected readonly books = computed(() => {
    const a = this.article();
    const catalog = this.catalog();
    return a && catalog ? mentionedBooks(a, catalog.books) : [];
  });

  /** Bài chuyên mục gợi ý đọc có từ 2 sách → bố cục danh sách (Figma 880:7637) */
  protected readonly isPicks = computed(() => fold(this.article()?.category ?? '').includes('goi y') && this.books().length >= 2);

  protected readonly category = computed(() => (this.article()?.category ? categoryLabel(this.article()!.category!) : ''));
  protected readonly date = computed(() => (this.article() ? newsDate(this.article()!) : ''));
  protected readonly cover = computed(() => {
    const a = this.article();
    if (!a) return '';
    return this.coverFailed() ? fallbackCover(a) : newsCover(a);
  });
  protected readonly authorInitials = computed(() => (this.article()?.author?.name ? toInitials(this.article()!.author!.name) : ''));

  protected readonly crumbs = computed<Crumb[]>(() => {
    const a = this.article();
    const items: Crumb[] = [
      { label: 'Trang chủ', link: '/' },
      { label: 'Lightbook News', link: '/news' },
    ];
    if (a?.category) items.push({ label: categoryLabel(a.category), link: '/news', queryParams: { category: a.category } });
    const title = a?.title ?? '';
    items.push({ label: title.length > CRUMB_TITLE_MAX ? `${title.slice(0, CRUMB_TITLE_MAX).trim()}…` : title });
    return items;
  });

  /** Chủ đề: chuyên mục, tag của bài (nếu có), tác giả của các sách được nhắc đến */
  protected readonly chips = computed<TopicChip[]>(() => {
    const a = this.article();
    if (!a) return [];
    const chips: TopicChip[] = [];
    if (a.category) chips.push({ label: categoryLabel(a.category), link: '/news', queryParams: { category: a.category } });
    for (const tag of a.tags ?? []) chips.push({ label: tag, link: '/news', queryParams: { q: tag } });
    const authors = new Map(this.books().filter((b) => b.authorId).map((b) => [b.authorId!, b.authorName]));
    for (const [id, name] of authors) chips.push({ label: name, link: ['/authors', id] });
    const seen = new Set<string>();
    return chips.filter((chip) => !seen.has(chip.label) && !!seen.add(chip.label)).slice(0, MAX_CHIPS);
  });

  constructor() {
    this.bookService
      .getCatalog()
      .pipe(catchError(() => of(null)), takeUntilDestroyed())
      .subscribe((catalog) => this.catalog.set(catalog));

    combineLatest([this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), this.retry$])
      .pipe(
        tap(() => {
          this.status.set('loading');
          this.related.set([]);
          this.coverFailed.set(false);
        }),
        switchMap(([id]) =>
          this.newsService.getArticle(id).pipe(
            // 404 = không có bài hoặc bài chưa đăng
            catchError((error: HttpErrorResponse) => of(error.status === 404 ? null : undefined)),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((article) => {
        if (article === undefined) return this.status.set('error');
        if (!article) return this.status.set('missing');
        this.article.set(article);
        this.status.set('ready');
        this.loadRelated(article);
      });
  }

  protected reload(): void {
    this.retry$.next(this.retry$.value + 1);
  }

  protected onCoverError(): void {
    this.coverFailed.set(true);
  }

  /** Bài liên quan: cùng chuyên mục trước, thiếu thì thêm bài mới nhất */
  private loadRelated(article: NewsItem): void {
    const others = (items: NewsItem[]) => items.filter((item) => item._id !== article._id);
    const fill = (picked: NewsItem[]) => {
      if (picked.length >= RELATED_COUNT) return this.related.set(picked.slice(0, RELATED_COUNT));
      this.newsService.getNews({ limit: RELATED_COUNT + 1 + picked.length }).subscribe({
        next: (page) => {
          const ids = new Set(picked.map((item) => item._id));
          this.related.set([...picked, ...others(page.items).filter((item) => !ids.has(item._id))].slice(0, RELATED_COUNT));
        },
        error: () => this.related.set(picked),
      });
    };
    if (!article.category) return fill([]);
    this.newsService.getNews({ category: article.category, limit: RELATED_COUNT + 1 }).subscribe({
      next: (page) => fill(others(page.items)),
      error: () => fill([]),
    });
  }
}
