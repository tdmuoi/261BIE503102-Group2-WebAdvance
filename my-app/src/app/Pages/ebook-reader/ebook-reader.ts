import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { map } from 'rxjs';

import { AccountService, EbookProgress } from '../../services/account-service';
import { AuthService } from '../../services/auth-service';
import { ToastService } from '../../services/toast-service';
import { SharedModule } from '../../shared/shared-module';
import { ShelfStore, normalizeText } from '../account/shelf-store';
import { PdfBook, PdfLoader, PdfOpenError } from './pdf-book';
import {
  Chapter, ReadMode, ReaderNote, ReaderSettings, ReaderState, ReaderTheme, ZOOM_MAX, ZOOM_MIN,
  chapterOf, loadSettings, loadState, remainingLabel, saveSettings, saveState, spreadPages, spreadStart, squash,
} from './reader-state';

type LeftPanel = 'toc' | 'search' | null;
type SearchHit = { page: number; snippet: string };

export const THEME_OPTIONS: { value: ReaderTheme; label: string }[] = [
  { value: 'white', label: 'Trắng' },
  { value: 'paper', label: 'Giấy' },
  { value: 'dark', label: 'Tối' },
];
export const MODE_OPTIONS: { value: ReadMode; label: string }[] = [
  { value: 'page', label: 'Lật trang' },
  { value: 'scroll', label: 'Cuộn dọc' },
];

/** Lật trang: bề ngang tối đa một trang ở mức thu phóng 100% */
const PAGE_WIDTH = 720;
/** Cột đọc rộng từ mức này trở lên thì lật trang hiện 2 trang */
const TWO_UP_MIN = 900;
/** Cuộn dọc: vẽ trước các trang cách màn hình khoảng này, trang xa hơn thì giải phóng */
const SCROLL_MARGIN = '1500px 0px';

/**
 * Trang Đọc ebook (Figma "Pages/ebook-reader · Đọc ebook") — route /ebook-reader/:id.
 * Nội dung là file PDF của sách (pdf.js), chỉ mở được khi server xác nhận sách có trong tủ sách.
 */
@Component({
  selector: 'app-ebook-reader',
  standalone: true,
  imports: [RouterModule, SharedModule],
  styleUrls: ['./ebook-reader.css', './reader-panels.css'],
  templateUrl: './ebook-reader.html',
  host: {
    '(document:keydown)': 'onKey($event)',
    '(window:scroll)': 'onScroll()',
    '(window:resize)': 'scheduleRender()',
    '(document:selectionchange)': 'onSelectionChange()',
  },
})
export class EbookReader {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly shelf = inject(ShelfStore);
  private readonly account = inject(AccountService);
  private readonly toast = inject(ToastService);
  private readonly pdfLoader = inject(PdfLoader);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly themeOptions = THEME_OPTIONS;
  readonly modeOptions = MODE_OPTIONS;
  readonly zoomMin = ZOOM_MIN;
  readonly zoomMax = ZOOM_MAX;

  readonly bookId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  readonly loggedIn = computed(() => !!this.auth.user());

  readonly ebook = computed(() => this.shelf.ebooks().find((e) => e.bookId === this.bookId()) ?? null);

  // ---------------- File PDF ----------------
  readonly pdf = signal<PdfBook | null>(null);
  readonly pdfStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly pdfError = signal('');

  readonly status = computed(() => {
    if (!this.loggedIn()) return 'login';
    const s = this.shelf.status();
    if (s !== 'ready') return s;
    if (!this.ebook()) return 'notfound';
    const p = this.pdfStatus();
    if (p === 'error') return 'pdferror';
    return p === 'ready' ? 'ready' : 'loading';
  });

  readonly settings = signal<ReaderSettings>(loadSettings());
  readonly state = signal<ReaderState | null>(null);
  readonly chapters = signal<Chapter[]>([]);

  readonly leftPanel = signal<LeftPanel>('toc');
  readonly settingsOpen = signal(true);
  readonly query = signal('');

  readonly total = computed(() => this.pdf()?.numPages || this.ebook()?.totalPages || 1);
  readonly page = computed(() => this.state()?.page ?? 1);
  readonly chapter = computed(() => chapterOf(this.chapters(), this.page()));
  readonly percent = computed(() => Math.ceil((this.page() / this.total()) * 100));
  readonly remaining = computed(() => remainingLabel(this.total() - this.page()));
  readonly bookmarked = computed(() => !!this.state()?.bookmarks.includes(this.page()));

  // ---------------- Bố cục trang ----------------
  /** Bề ngang cột đọc (giữa 2 bảng bên) — đo lại khi đổi cỡ cửa sổ / đóng mở bảng */
  readonly columnWidth = signal(PAGE_WIDTH);
  /** Cao / rộng trang PDF (lấy từ trang 1) để giữ chỗ trước khi vẽ */
  readonly pageRatio = signal(1.414);
  readonly isScroll = computed(() => this.settings().mode === 'scroll');
  /** Lật trang trên cột rộng: mở 2 trang như sách thật */
  readonly twoUp = computed(() => !this.isScroll() && this.columnWidth() >= TWO_UP_MIN);
  /** Bề ngang một trang trên màn hình. Cuộn dọc: rộng bằng cả cột đọc (100%) */
  readonly pageWidth = computed(() => {
    const col = Math.max(240, this.columnWidth());
    const base = this.isScroll() ? col - 8 : this.twoUp() ? Math.min((col - 8) / 2, PAGE_WIDTH) : Math.min(col, PAGE_WIDTH);
    return Math.floor(base * (this.settings().zoom / 100));
  });
  readonly pageHeight = computed(() => Math.round(this.pageWidth() * this.pageRatio()));

  /** Lật trang: 2 trang (hoặc 1 trang khi màn hình hẹp). Cuộn dọc: cả cuốn, trang nào gần màn hình mới vẽ */
  readonly visiblePages = computed(() =>
    this.isScroll() ? Array.from({ length: this.total() }, (_, i) => i + 1) : spreadPages(this.page(), this.total(), this.twoUp()),
  );
  /** "Trang 31–32" khi mở 2 trang */
  readonly pageLabel = computed(() => {
    const shown = this.isScroll() ? [this.page()] : this.visiblePages();
    return shown.length > 1 ? `${shown[0]}–${shown[1]}` : String(shown[0] ?? this.page());
  });
  /** Câu đã tô sáng — tách riêng để đổi trang không kích hoạt vẽ lại */
  readonly highlights = computed(() => this.state()?.highlights ?? []);
  /** Hướng lật để chạy hiệu ứng: next = sang trang sau, prev = về trang trước */
  readonly flip = signal<'next' | 'prev' | null>(null);

  readonly marks = computed(() => {
    const s = this.state();
    return [
      ...(s?.bookmarks ?? []).map((p) => ({ key: `b-${p}`, page: p, label: `Trang ${p}`, kind: 'bookmark' as const, note: null as ReaderNote | null })),
      ...(s?.notes ?? []).map((n) => ({ key: n.id, page: n.page, label: `Ghi chú · trang ${n.page}`, kind: 'note' as const, note: n })),
    ].sort((a, b) => a.page - b.page);
  });

  /** Tìm trong sách: đọc chữ từng trang PDF (chạy sau khi ngừng gõ 0,3 giây) */
  readonly searchResults = signal<{ items: SearchHit[]; more: number; searching: boolean }>({ items: [], more: 0, searching: false });

  /** Thanh công cụ khi bôi đen chữ */
  readonly selection = signal<{ page: number; text: string; top: number; left: number } | null>(null);
  readonly noteDraft = signal<{ page: number; quote: string; text: string; top: number; left: number } | null>(null);

  constructor() {
    this.shelf.load(this.destroyRef);

    // Có sách trong tủ → mở file PDF
    effect(() => {
      const id = this.ebook()?.bookId;
      if (!id || !this.loggedIn()) return;
      untracked(() => this.openPdf(id));
    });

    // Mở sách: hiện ngay bản nháp trên máy (hoặc trang đang đọc ở tủ sách), rồi lấy bản lưu trên server
    effect(() => {
      const e = this.ebook();
      if (!e) return;
      untracked(() => {
        const s = loadState(e.bookId, e.progress >= 100 ? 1 : e.page || 1);
        this.state.set({ ...s, page: clamp(s.page, 1, this.total()) });
        this.account
          .getEbookProgress(e.bookId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({ next: (remote) => this.applyRemote(remote), error: () => undefined });
      });
    });

    // Lưu tiến độ mỗi khi đổi trang / đánh dấu / ghi chú: nháp localStorage ngay, server sau 0,8 giây
    effect(() => {
      const s = this.state();
      const e = untracked(() => this.ebook());
      if (!s || !e) return;
      saveState(e.bookId, s);
      untracked(() => this.queueSync());
    });

    effect(() => saveSettings(this.settings()));

    // Vẽ lại khi đổi trang / bố cục / thu phóng / tô sáng
    effect(() => {
      this.visiblePages();
      this.pageWidth();
      this.highlights(); // không đọc cả state: cuộn đổi trang không phải dựng lại
      if (this.status() === 'ready') untracked(() => this.scheduleRender());
    });

    // Tìm trong sách
    effect(() => {
      const q = normalizeText(this.query());
      const book = this.pdf();
      untracked(() => this.queueSearch(q, book));
    });

    this.destroyRef.onDestroy(() => {
      this.flushSync();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (this.renderTimer) clearTimeout(this.renderTimer);
      if (this.flipTimer) clearTimeout(this.flipTimer);
      this.observer?.disconnect();
      this.resizer?.disconnect();
      this.pdf()?.destroy();
    });
  }

  // ---------------- Mở PDF ----------------
  private openedId: string | null = null;

  private openPdf(bookId: string): void {
    if (this.openedId === bookId) return;
    this.openedId = bookId;
    this.pdf()?.destroy();
    this.pdf.set(null);
    this.chapters.set([]);
    this.pdfStatus.set('loading');
    this.pdfLoader.open(bookId).then(
      async (book) => {
        if (this.openedId !== bookId) return book.destroy();
        this.pageRatio.set(await book.pageRatio(1).catch(() => 1.414));
        if (this.openedId !== bookId) return book.destroy();
        this.pdf.set(book);
        const s = this.state();
        if (s) this.state.set({ ...s, page: clamp(s.page, 1, book.numPages) });
        this.scrolledToStart = false;
        this.pdfStatus.set('ready');
        const outline = await book.outline().catch(() => []);
        if (this.openedId === bookId) this.chapters.set(outline.map((o, i) => ({ index: i + 1, title: o.title, startPage: o.page })));
      },
      (err: unknown) => {
        if (this.openedId !== bookId) return;
        this.pdfError.set(err instanceof PdfOpenError ? err.message : 'Không mở được file PDF của sách.');
        this.pdfStatus.set('error');
      },
    );
  }

  retry(): void {
    const id = this.ebook()?.bookId;
    this.openedId = null;
    if (id) this.openPdf(id);
  }

  // ---------------- Vẽ trang ----------------
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.renderVisible());
  }

  private observer: IntersectionObserver | null = null;
  private resizer: ResizeObserver | null = null;
  private scrolledToStart = false;

  private renderVisible(): void {
    this.renderTimer = null;
    const root = this.host.nativeElement;
    if (!this.pdf()) return;
    this.watchColumn(root.querySelector<HTMLElement>('.pages'));
    const articles = Array.from(root.querySelectorAll<HTMLElement>('article[data-page]'));
    this.observer?.disconnect();
    this.observer = null;
    if (!this.isScroll()) {
      articles.forEach((a) => this.renderArticle(a));
      return;
    }
    // Cuộn dọc: chỉ vẽ trang gần màn hình, trang đã cuộn xa thì giải phóng cho nhẹ máy
    if (typeof IntersectionObserver === 'undefined') {
      articles.filter((a) => Math.abs(Number(a.dataset['page']) - this.page()) <= 2).forEach((a) => this.renderArticle(a));
    } else {
      this.observer = new IntersectionObserver(
        (entries) => entries.forEach((e) => (e.isIntersecting ? this.renderArticle(e.target as HTMLElement) : this.releaseArticle(e.target as HTMLElement))),
        { rootMargin: SCROLL_MARGIN },
      );
      articles.forEach((a) => this.observer!.observe(a));
    }
    if (!this.scrolledToStart) {
      this.scrolledToStart = true;
      this.scrollToPage(this.page(), 'auto');
    }
  }

  /** Đo bề ngang cột đọc (đóng / mở bảng bên, đổi cỡ cửa sổ) */
  private watchColumn(column: HTMLElement | null): void {
    if (!column) return;
    const measure = () => {
      const width = column.clientWidth;
      if (width > 0 && Math.abs(width - this.columnWidth()) > 4) this.columnWidth.set(width);
    };
    measure();
    if (this.resizer || typeof ResizeObserver === 'undefined') return;
    this.resizer = new ResizeObserver(measure);
    this.resizer.observe(column);
  }

  private renderArticle(article: HTMLElement): void {
    const book = this.pdf();
    const n = Number(article.dataset['page']);
    const canvas = article.querySelector('canvas');
    const text = article.querySelector<HTMLElement>('.textLayer');
    if (!book || !n || !canvas || !text) return;
    const width = this.pageWidth();
    const key = `${n}|${width}`;
    if (canvas.dataset['key'] === key) {
      this.applyHighlights(text, n);
      return;
    }
    canvas.dataset['key'] = key;
    book.renderPage(n, canvas, text, width).then(
      () => this.applyHighlights(text, n),
      () => {
        canvas.dataset['key'] = '';
        this.toast.show(`Chưa hiển thị được trang ${n}`);
      },
    );
  }

  private releaseArticle(article: HTMLElement): void {
    const canvas = article.querySelector('canvas');
    if (!canvas?.dataset['key']) return;
    canvas.dataset['key'] = '';
    canvas.width = 0;
    canvas.height = 0;
    article.querySelector<HTMLElement>('.textLayer')?.replaceChildren();
  }

  /** Tô màu các dòng chữ PDF nằm trong câu đã tô sáng */
  private applyHighlights(textLayer: HTMLElement, page: number): void {
    const marks = this.marksOf(page).map(squash).filter(Boolean);
    for (const span of Array.from(textLayer.querySelectorAll<HTMLElement>('span:not(.markedContent)'))) {
      const t = squash(span.textContent ?? '');
      span.classList.toggle('hl', t.length >= 2 && marks.some((m) => m.includes(t)));
    }
  }

  // ---------------- Tìm trong sách ----------------
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRun = 0;

  private queueSearch(q: string, book: PdfBook | null): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const run = ++this.searchRun;
    if (q.length < 2 || !book) {
      this.searchResults.set({ items: [], more: 0, searching: false });
      return;
    }
    this.searchResults.set({ items: [], more: 0, searching: true });
    this.searchTimer = setTimeout(async () => {
      const all: SearchHit[] = [];
      for (let p = 1; p <= book.numPages; p++) {
        const text = await book.pageText(p).catch(() => '');
        if (run !== this.searchRun) return;
        const i = normalizeText(text).indexOf(q);
        if (i >= 0) all.push({ page: p, snippet: (i > 30 ? '…' : '') + text.slice(Math.max(0, i - 30), i + q.length + 50) + '…' });
      }
      this.searchResults.set({ items: all.slice(0, 20), more: Math.max(0, all.length - 20), searching: false });
    }, 300);
  }

  // ---------------- Đồng bộ tiến độ với server ----------------
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private synced: string | null = null;

  /** Bản trên server mới hơn bản nháp (vd. đọc ở máy khác) thì dùng bản server */
  private applyRemote(remote: EbookProgress): void {
    const e = this.ebook();
    const local = this.state();
    if (!e || !local) return;
    const remoteNewer = !!remote.lastReadAt && (!local.lastReadAt || remote.lastReadAt > local.lastReadAt);
    if (!remoteNewer) return;
    const next: ReaderState = {
      page: clamp(remote.page || 1, 1, this.total()),
      bookmarks: remote.bookmarks ?? [],
      notes: (remote.notes ?? []).map((n, i) => ({ id: n.id || `n-${i}`, page: n.page, quote: n.quote ?? '', text: n.text ?? '' })),
      highlights: remote.highlights ?? [],
      lastReadAt: remote.lastReadAt ?? null,
    };
    this.synced = JSON.stringify(this.progressBody(next));
    this.state.set(next);
  }

  private progressBody(s: ReaderState): EbookProgress {
    return { page: s.page, totalPages: this.total(), bookmarks: s.bookmarks, notes: s.notes, highlights: s.highlights };
  }

  private queueSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.flushSync(), 800);
  }

  private flushSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    const e = this.ebook();
    const s = this.state();
    // Chưa mở được PDF thì chưa biết tổng số trang thật — không ghi đè tiến độ trên server
    if (!e || !s || !this.pdf() || !this.auth.isLoggedIn()) return;
    const body = this.progressBody(s);
    const key = JSON.stringify(body);
    if (key === this.synced) return;
    this.synced = key;
    this.account.saveEbookProgress(e.bookId, body).subscribe({ error: () => (this.synced = null) });
  }

  // ---------------- Điều hướng ----------------
  goTo(page: number, scroll = true): void {
    const s = this.state();
    if (!s) return;
    const target = clamp(Math.round(page), 1, this.total());
    this.selection.set(null);
    this.noteDraft.set(null);
    if (target !== s.page) this.state.set({ ...s, page: target, lastReadAt: new Date().toISOString() });
    if (scroll && this.settings().mode === 'scroll') setTimeout(() => this.scrollToPage(target));
  }

  /** Lật 2 trang: sang cặp trước / sau. 1 trang hoặc cuộn dọc: từng trang */
  prev(): void {
    const target = this.twoUp() ? spreadStart(this.page()) - 2 : this.page() - 1;
    if (target < 1) return;
    this.turn('prev');
    this.goTo(target);
  }

  next(): void {
    const target = this.twoUp() ? spreadStart(this.page()) + 2 : this.page() + 1;
    if (target > this.total()) return;
    this.turn('next');
    this.goTo(target);
  }

  get atStart(): boolean {
    return (this.twoUp() ? spreadStart(this.page()) : this.page()) <= 1;
  }

  get atEnd(): boolean {
    return (this.twoUp() ? spreadStart(this.page()) + 1 : this.page()) >= this.total();
  }

  private flipTimer: ReturnType<typeof setTimeout> | null = null;

  /** Hiệu ứng lật (chỉ ở chế độ lật trang) */
  private turn(direction: 'next' | 'prev'): void {
    if (this.isScroll()) return;
    if (this.flipTimer) clearTimeout(this.flipTimer);
    this.flip.set(direction);
    this.flipTimer = setTimeout(() => this.flip.set(null), 600);
  }

  onSlider(event: Event): void {
    this.goTo(Number((event.target as HTMLInputElement).value));
  }

  onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.status() !== 'ready' || target?.closest('input, textarea, select')) return;
    if (event.key === 'Escape') {
      this.selection.set(null);
      this.noteDraft.set(null);
    }
    if (this.isScroll()) return;
    if (event.key === 'ArrowLeft') this.prev();
    if (event.key === 'ArrowRight') this.next();
  }

  /** Cuộn dọc: trang nằm ở nửa trên màn hình là trang đang đọc */
  onScroll(): void {
    if (this.settings().mode !== 'scroll' || !this.state()) return;
    const pages = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-page]'));
    const mid = window.innerHeight / 2;
    const inView = pages.find((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= mid && r.bottom >= mid;
    });
    const n = Number(inView?.dataset['page']);
    if (n && n !== this.page()) this.goTo(n, false);
  }

  private scrollToPage(page: number, behavior: ScrollBehavior = 'smooth'): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-page="${page}"]`)?.scrollIntoView?.({ block: 'start', behavior });
  }

  // ---------------- Công cụ ----------------
  togglePanel(panel: Exclude<LeftPanel, null>): void {
    this.leftPanel.update((p) => (p === panel ? null : panel));
  }

  toggleBookmark(): void {
    const s = this.state();
    if (!s) return;
    const p = this.page();
    const has = s.bookmarks.includes(p);
    this.state.set({ ...s, bookmarks: has ? s.bookmarks.filter((b) => b !== p) : [...s.bookmarks, p].sort((a, b) => a - b) });
    this.toast.show(has ? `Đã bỏ đánh dấu trang ${p}` : `Đã đánh dấu trang ${p}`);
  }

  toggleDark(): void {
    this.setSetting('theme', this.settings().theme === 'dark' ? 'paper' : 'dark');
  }

  setSetting<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
    if (key === 'mode') {
      this.scrolledToStart = value !== 'scroll'; // vào cuộn dọc: nhảy tới trang đang đọc sau khi dựng trang
      if (value !== 'scroll') window.scrollTo?.({ top: 0 });
    }
  }

  onZoom(event: Event): void {
    this.setSetting('zoom', Number((event.target as HTMLInputElement).value));
  }

  removeMark(mark: { kind: 'bookmark' | 'note'; page: number; note: ReaderNote | null }): void {
    const s = this.state();
    if (!s) return;
    if (mark.kind === 'bookmark') this.state.set({ ...s, bookmarks: s.bookmarks.filter((b) => b !== mark.page) });
    else this.state.set({ ...s, notes: s.notes.filter((n) => n.id !== mark.note?.id) });
  }

  // ---------------- Bôi đen chữ ----------------
  marksOf(page: number): string[] {
    return (this.state()?.highlights ?? []).filter((h) => h.page === page).map((h) => h.text);
  }

  onSelectionChange(): void {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel || sel.isCollapsed) {
      if (!this.noteDraft()) this.selection.set(null);
    }
  }

  /** Nhả chuột sau khi bôi đen trong trang sách → hiện thanh Tô sáng / Ghi chú / Sao chép / Tra từ */
  onTextSelect(event?: Event): void {
    if ((event?.target as HTMLElement | null)?.closest('.selection-bar, .note-pop')) return;
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!sel || !text || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const pageEl = (range.commonAncestorContainer.parentElement ?? null)?.closest<HTMLElement>('[data-page]');
    if (!pageEl) return;
    const rect = range.getBoundingClientRect();
    const box = pageEl.getBoundingClientRect();
    this.noteDraft.set(null);
    this.selection.set({
      page: Number(pageEl.dataset['page']),
      text,
      top: Math.max(8, rect.top - box.top - 44),
      left: clamp(rect.left - box.left, 8, Math.max(8, box.width - 300)),
    });
  }

  highlight(): void {
    const sel = this.selection();
    const s = this.state();
    if (!sel || !s) return;
    if (!s.highlights.some((h) => h.page === sel.page && h.text === sel.text)) {
      this.state.set({ ...s, highlights: [...s.highlights, { page: sel.page, text: sel.text }] });
    }
    this.clearSelection();
    this.toast.show('Đã tô sáng đoạn văn');
  }

  startNote(): void {
    const sel = this.selection();
    if (!sel) return;
    this.noteDraft.set({ page: sel.page, quote: sel.text, text: '', top: sel.top + 44, left: sel.left });
    this.selection.set(null);
  }

  onNoteInput(event: Event): void {
    const draft = this.noteDraft();
    if (draft) this.noteDraft.set({ ...draft, text: (event.target as HTMLTextAreaElement).value.slice(0, 300) });
  }

  saveNote(): void {
    const draft = this.noteDraft();
    const s = this.state();
    if (!draft || !s) return;
    const note: ReaderNote = { id: `n-${Date.now()}`, page: draft.page, quote: draft.quote, text: draft.text.trim() };
    const highlights = s.highlights.some((h) => h.page === draft.page && h.text === draft.quote) ? s.highlights : [...s.highlights, { page: draft.page, text: draft.quote }];
    this.state.set({ ...s, notes: [...s.notes, note], highlights });
    this.noteDraft.set(null);
    window.getSelection()?.removeAllRanges();
    this.toast.show(`Đã lưu ghi chú ở trang ${draft.page}`);
  }

  copy(): void {
    const text = this.selection()?.text;
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => this.toast.show('Đã sao chép'),
      () => this.toast.show('Trình duyệt không cho sao chép'),
    );
    this.clearSelection();
  }

  lookup(): void {
    // TODO: thay bằng API từ điển khi có
    this.toast.show('Tính năng tra từ sắp có');
    this.clearSelection();
  }

  clearSelection(): void {
    this.selection.set(null);
    window.getSelection()?.removeAllRanges();
  }

  loginLink(): { path: string; params: { returnUrl: string } } {
    return { path: '/login', params: { returnUrl: this.router.url } };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
