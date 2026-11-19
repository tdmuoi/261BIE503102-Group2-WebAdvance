import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { LbEvent } from '../../../models/content';
import { AuthorDirectoryService, AuthorProfile, VI_LETTERS } from '../../../services/author-directory-service';
import { EventService } from '../../../services/event-service';
import { AuthorFollow } from '../author-follow';

type SortKey = 'az' | 'za' | 'books';

const PAGE_SIZE = 12;

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

@Component({
  selector: 'app-author-list',
  standalone: false,
  styleUrls: ['../author-filters.css', './author-list.css'],
  templateUrl: './author-list.html',
})
export class AuthorList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly directory = inject(AuthorDirectoryService);
  private readonly eventService = inject(EventService);
  protected readonly follow = inject(AuthorFollow);

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly authors = signal<AuthorProfile[]>([]);
  protected readonly nextEvent = signal<LbEvent | null>(null);

  protected readonly crumbs = [{ label: 'Trang chủ', link: '/' }, { label: 'Tác giả' }];
  protected readonly marquee = ['Author of the month', 'Monthly author discussions', 'Handpicked indie titles'];

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly query = computed(() => {
    const p = this.params();
    const sort = p.get('sort');
    return {
      q: p.get('q') ?? '',
      genre: p.get('genre') ?? '',
      sort: (sort === 'za' || sort === 'books' ? sort : 'az') as SortKey,
      letter: p.get('letter') ?? '',
      page: Math.max(Number(p.get('page')) || 1, 1),
    };
  });

  protected readonly genres = computed(() =>
    [...new Set(this.authors().flatMap((a) => a.genres))].sort((a, b) => a.localeCompare(b, 'vi')),
  );

  protected readonly letters = computed(() => {
    const present = new Set(this.authors().map((a) => a.letter));
    const latin = [...present].filter((l) => l !== '#' && !VI_LETTERS.includes(l)).sort();
    return [...VI_LETTERS.filter((l) => present.has(l)), ...latin, ...(present.has('#') ? ['#'] : [])];
  });

  protected readonly featured = computed(() =>
    this.authors().reduce<AuthorProfile | null>((best, a) => (a.books.length > (best?.books.length ?? 0) ? a : best), null),
  );

  protected readonly filtered = computed(() => {
    const { q, genre, sort, letter } = this.query();
    const needle = fold(q.trim());
    const list = this.authors().filter(
      (a) =>
        (!needle || fold(a.name).includes(needle)) &&
        (!genre || a.genres.includes(genre)) &&
        (!letter || a.letter === letter),
    );
    if (sort === 'za') return [...list].reverse();
    if (sort === 'books') return [...list].sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name, 'vi'));
    return list;
  });

  protected readonly totalPages = computed(() => Math.max(Math.ceil(this.filtered().length / PAGE_SIZE), 1));
  protected readonly page = computed(() => Math.min(this.query().page, this.totalPages()));
  protected readonly pageItems = computed(() => this.filtered().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));
  protected readonly hasFilter = computed(() => {
    const { q, genre, letter } = this.query();
    return !!(q || genre || letter);
  });

  constructor() {
    this.load();
    this.eventService.getEvents({ when: 'upcoming', limit: 1 }).subscribe({
      next: (list) => this.nextEvent.set(list[0] ?? null),
      error: () => this.nextEvent.set(null),
    });
  }

  protected load(): void {
    this.status.set('loading');
    this.directory.getProfiles().subscribe({
      next: (list) => {
        this.authors.set(list);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  protected update(patch: Params): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null, ...patch },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goToPage(page: number): void {
    this.update({ page: page > 1 ? page : null });
    document.getElementById('all-authors')?.scrollIntoView({ behavior: 'smooth' });
  }

  protected clearFilters(): void {
    this.update({ q: null, genre: null, letter: null });
  }
}
