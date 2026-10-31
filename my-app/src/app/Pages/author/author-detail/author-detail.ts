import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { LbEvent, NewsItem } from '../../../models/content';
import { AuthorDirectoryService, AuthorProfile } from '../../../services/author-directory-service';
import { EventService } from '../../../services/event-service';
import { NewsService } from '../../../services/news-service';
import { AuthorFollow } from '../author-follow';

type WorkSort = 'newest' | 'price-asc' | 'price-desc';

/** Số sách hiện ở mục "Tác phẩm" (1 hàng như Figma) */
const SHELF_SIZE = 5;

/** Trang chi tiết tác giả /authors/:id */
@Component({
  selector: 'app-author-detail',
  standalone: false,
  styleUrls: ['../author-filters.css', './author-detail.css'],
  templateUrl: './author-detail.html',
})
export class AuthorDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly directory = inject(AuthorDirectoryService);
  private readonly eventService = inject(EventService);
  private readonly newsService = inject(NewsService);
  protected readonly follow = inject(AuthorFollow);

  protected readonly status = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly author = signal<AuthorProfile | null>(null);
  protected readonly events = signal<LbEvent[]>([]);
  protected readonly articles = signal<NewsItem[]>([]);
  protected readonly reserving = signal<LbEvent | null>(null);

  protected readonly genre = signal('');
  protected readonly sort = signal<WorkSort>('newest');

  protected readonly crumbs = computed(() => [
    { label: 'Trang chủ', link: '/' },
    { label: 'Tác giả', link: '/authors' },
    { label: this.author()?.name ?? '' },
  ]);

  /** Chip thể loại kèm số sách */
  protected readonly genreChips = computed(() => {
    const books = this.author()?.books ?? [];
    return (this.author()?.genres ?? []).map((name) => ({ name, count: books.filter((b) => b.categoryName === name).length }));
  });

  protected readonly shelf = computed(() => {
    const books = (this.author()?.books ?? []).filter((b) => !this.genre() || b.categoryName === this.genre());
    const sorted = [...books];
    if (this.sort() === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    if (this.sort() === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    if (this.sort() === 'newest') sorted.sort((a, b) => (b.publishYear ?? 0) - (a.publishYear ?? 0) || b.createdAt.localeCompare(a.createdAt));
    return sorted.slice(0, SHELF_SIZE);
  });

  /** Tăng lên để tải lại sau khi lỗi */
  private readonly retry$ = new BehaviorSubject(0);

  constructor() {
    combineLatest([this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), this.retry$])
      .pipe(
        tap(() => {
          this.status.set('loading');
          this.genre.set('');
          this.events.set([]);
          this.articles.set([]);
        }),
        // undefined = lỗi tải, null = không có tác giả này
        switchMap(([id]) => this.directory.getProfile(id).pipe(catchError(() => of(undefined)))),
        takeUntilDestroyed(),
      )
      .subscribe((author) => {
        if (author === undefined) return this.status.set('error');
        if (!author) return this.status.set('missing');
        this.author.set(author);
        this.status.set('ready');
        this.loadRelated(author);
      });
  }

  protected reload(): void {
    this.retry$.next(this.retry$.value + 1);
  }

  /** Sự kiện và bài viết liên quan — lỗi hoặc không có thì chỉ ẩn mục tương ứng */
  private loadRelated(author: AuthorProfile): void {
    this.eventService.getEvents({ authorId: author.id, when: 'upcoming', limit: 3 }).subscribe({
      next: (list) => this.events.set(list),
      error: () => this.events.set([]),
    });
    this.newsService.getNews({ search: author.name, limit: 3 }).subscribe({
      next: (page) => this.articles.set(page.items),
      error: () => this.articles.set([]),
    });
  }
}
