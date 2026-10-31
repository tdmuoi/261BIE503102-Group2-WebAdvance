import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { Catalog } from '../../../models/book';
import { LbEvent } from '../../../models/content';
import { BookService } from '../../../services/book-service';
import { EventService } from '../../../services/event-service';
import { monthKey } from '../../../shared/event-utils';

type EventFilter = '' | 'upcoming' | 'store' | 'online' | 'past';

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'upcoming', label: 'Sắp diễn ra' },
  { key: 'store', label: 'Tại cửa hàng' },
  { key: 'online', label: 'Online' },
  { key: 'past', label: 'Đã diễn ra' },
];

/** Trang sự kiện giao lưu chung /authors/events — query params: filter, month (YYYY-MM) */
@Component({
  selector: 'app-author-events',
  standalone: false,
  styleUrls: ['../author-filters.css', './author-events.css'],
  templateUrl: './author-events.html',
})
export class AuthorEvents {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly bookService = inject(BookService);

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly events = signal<LbEvent[]>([]);
  /** Sách + tác giả để lấy bìa sách thật và tên khách mời; lỗi thì để null (ẩn bìa) */
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly reserving = signal<LbEvent | null>(null);

  protected readonly filters = FILTERS;
  protected readonly crumbs = [
    { label: 'Trang chủ', link: '/' },
    { label: 'Tác giả', link: '/authors' },
    { label: 'Sự kiện giao lưu' },
  ];

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly query = computed(() => {
    const filter = (this.params().get('filter') ?? '') as EventFilter;
    return { filter: FILTERS.some((f) => f.key === filter) ? filter : '', month: this.params().get('month') ?? '' };
  });

  private readonly now = Date.now();
  private readonly upcoming = computed(() => this.events().filter((e) => new Date(e.startAt).getTime() >= this.now));
  private readonly past = computed(() => this.events().filter((e) => new Date(e.startAt).getTime() < this.now));

  /** Sự kiện nổi bật: sắp diễn ra gần nhất */
  protected readonly featured = computed(() => this.upcoming()[0] ?? null);

  /** Các tháng có sự kiện, mới nhất trước */
  protected readonly months = computed(() =>
    [...new Set(this.events().map((e) => monthKey(e.startAt)))].sort().reverse().map((key) => {
      const [year, month] = key.split('-');
      return { key, label: `Tháng ${Number(month)}/${year}` };
    }),
  );

  private matches(event: LbEvent): boolean {
    const { filter, month } = this.query();
    if (month && monthKey(event.startAt) !== month) return false;
    if (filter === 'store') return event.format !== 'online';
    if (filter === 'online') return event.format === 'online';
    return true;
  }

  protected readonly upcomingList = computed(() =>
    this.query().filter === 'past' ? [] : this.upcoming().filter((e) => e !== this.featured() && this.matches(e)),
  );
  protected readonly pastList = computed(() => (this.query().filter === 'upcoming' ? [] : this.past().filter((e) => this.matches(e))));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.status.set('loading');
    forkJoin({
      events: this.eventService.getEvents({ limit: 200 }),
      catalog: this.bookService.getCatalog().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ events, catalog }) => {
        this.events.set(events);
        this.catalog.set(catalog);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  protected update(patch: Params): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: patch, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
