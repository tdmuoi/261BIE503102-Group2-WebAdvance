import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../services/auth-service';
import { ToastService } from '../../services/toast-service';
import { ShelfStore, normalizeText } from '../account/shelf-store';
import {
  FONT_SIZE_MAX, FONT_SIZE_MIN, LineSpacing, ReadMode, ReaderFont, ReaderNote, ReaderSettings, ReaderState, ReaderTheme,
  buildChapters, chapterOf, loadSettings, loadState, mockGetPage, remainingLabel, saveSettings, saveState,
} from './ebook-reader.mock';

type LeftPanel = 'toc' | 'search' | null;

export const LINE_OPTIONS: { value: LineSpacing; label: string; ratio: number }[] = [
  { value: 'narrow', label: 'Hẹp', ratio: 1.6 },
  { value: 'normal', label: 'Vừa', ratio: 1.85 },
  { value: 'wide', label: 'Rộng', ratio: 2.1 },
];
export const FONT_OPTIONS: { value: ReaderFont; label: string }[] = [
  { value: 'sans', label: 'Không chân' },
  { value: 'serif', label: 'Có chân' },
];
export const THEME_OPTIONS: { value: ReaderTheme; label: string }[] = [
  { value: 'white', label: 'Trắng' },
  { value: 'paper', label: 'Giấy' },
  { value: 'dark', label: 'Tối' },
];
export const MODE_OPTIONS: { value: ReadMode; label: string }[] = [
  { value: 'page', label: 'Lật trang' },
  { value: 'scroll', label: 'Cuộn dọc' },
];

/** Cắt đoạn văn thành các phần thường / đã tô sáng */
export function splitMarks(text: string, marks: string[]): { text: string; mark: boolean }[] {
  const found = marks
    .map((m) => ({ m, i: text.indexOf(m) }))
    .filter((x) => x.m && x.i >= 0)
    .sort((a, b) => a.i - b.i);
  const parts: { text: string; mark: boolean }[] = [];
  let pos = 0;
  for (const { m, i } of found) {
    if (i < pos) continue;
    if (i > pos) parts.push({ text: text.slice(pos, i), mark: false });
    parts.push({ text: m, mark: true });
    pos = i + m.length;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), mark: false });
  return parts;
}

/** Trang Đọc ebook (Figma "Pages/ebook-reader · Đọc ebook") — route /ebook-reader/:id */
@Component({
  selector: 'app-ebook-reader',
  standalone: false,
  styleUrls: ['./ebook-reader.css', './reader-panels.css'],
  templateUrl: './ebook-reader.html',
  host: {
    '(document:keydown)': 'onKey($event)',
    '(window:scroll)': 'onScroll()',
    '(document:selectionchange)': 'onSelectionChange()',
  },
})
export class EbookReader {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly shelf = inject(ShelfStore);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly lineOptions = LINE_OPTIONS;
  readonly fontOptions = FONT_OPTIONS;
  readonly themeOptions = THEME_OPTIONS;
  readonly modeOptions = MODE_OPTIONS;
  readonly fontMin = FONT_SIZE_MIN;
  readonly fontMax = FONT_SIZE_MAX;

  readonly bookId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  readonly loggedIn = computed(() => !!this.auth.user());

  readonly ebook = computed(() => this.shelf.ebooks().find((e) => e.bookId === this.bookId()) ?? null);
  readonly status = computed(() => {
    if (!this.loggedIn()) return 'login';
    const s = this.shelf.status();
    if (s !== 'ready') return s;
    return this.ebook() ? 'ready' : 'notfound';
  });

  readonly settings = signal<ReaderSettings>(loadSettings());
  readonly state = signal<ReaderState | null>(null);

  readonly leftPanel = signal<LeftPanel>('toc');
  readonly settingsOpen = signal(true);
  readonly query = signal('');

  readonly total = computed(() => this.ebook()?.totalPages || 140);
  readonly chapters = computed(() => buildChapters(this.total()));
  readonly page = computed(() => this.state()?.page ?? 1);
  readonly current = computed(() => mockGetPage(this.chapters(), this.page()));
  readonly percent = computed(() => Math.ceil((this.page() / this.total()) * 100));
  readonly remaining = computed(() => remainingLabel(this.total() - this.page()));
  readonly bookmarked = computed(() => !!this.state()?.bookmarks.includes(this.page()));
  readonly lineRatio = computed(() => LINE_OPTIONS.find((o) => o.value === this.settings().lineSpacing)?.ratio ?? 1.85);

  /** Cuộn dọc: hiện cả chương đang đọc */
  readonly chapterPages = computed(() => {
    const chapters = this.chapters();
    const ch = chapterOf(chapters, this.page());
    const next = chapters.find((c) => c.index === ch.index + 1);
    const end = next ? next.startPage - 1 : this.total();
    return Array.from({ length: end - ch.startPage + 1 }, (_, i) => mockGetPage(chapters, ch.startPage + i));
  });
  readonly visiblePages = computed(() => (this.settings().mode === 'scroll' ? this.chapterPages() : [this.current()]));

  readonly marks = computed(() => {
    const s = this.state();
    return [
      ...(s?.bookmarks ?? []).map((p) => ({ key: `b-${p}`, page: p, label: `Trang ${p}`, kind: 'bookmark' as const, note: null as ReaderNote | null })),
      ...(s?.notes ?? []).map((n) => ({ key: n.id, page: n.page, label: `Ghi chú · trang ${n.page}`, kind: 'note' as const, note: n })),
    ].sort((a, b) => a.page - b.page);
  });

  readonly searchResults = computed(() => {
    const q = normalizeText(this.query());
    if (q.length < 2) return { items: [], more: 0 };
    const all: { page: number; snippet: string }[] = [];
    for (let p = 1; p <= this.total(); p++) {
      for (const para of mockGetPage(this.chapters(), p).paragraphs) {
        const i = normalizeText(para).indexOf(q);
        if (i >= 0) all.push({ page: p, snippet: (i > 30 ? '…' : '') + para.slice(Math.max(0, i - 30), i + q.length + 50) + '…' });
      }
    }
    return { items: all.slice(0, 20), more: Math.max(0, all.length - 20) };
  });

  /** Thanh công cụ khi bôi đen chữ */
  readonly selection = signal<{ page: number; text: string; top: number; left: number } | null>(null);
  readonly noteDraft = signal<{ page: number; quote: string; text: string; top: number; left: number } | null>(null);

  constructor() {
    this.shelf.load(this.destroyRef);

    // Mở sách: đọc tiến độ đã lưu (hoặc trang đang đọc ở tủ sách)
    effect(() => {
      const e = this.ebook();
      if (!e) return;
      untracked(() => {
        const s = loadState(e.bookId, e.progress >= 100 ? 1 : e.page || 1);
        this.state.set({ ...s, page: clamp(s.page, 1, e.totalPages || 140) });
      });
    });

    // Lưu tiến độ mỗi khi đổi trang / đánh dấu / ghi chú
    effect(() => {
      const s = this.state();
      const e = untracked(() => this.ebook());
      // TODO: thay bằng API — PUT /api/account/ebooks/:id/progress
      if (s && e) saveState(e.bookId, s).subscribe();
    });

    effect(() => saveSettings(this.settings()));
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

  prev(): void {
    if (this.settings().mode === 'scroll') {
      const ch = chapterOf(this.chapters(), this.page());
      const prevCh = this.chapters().find((c) => c.index === ch.index - 1);
      this.goTo(prevCh ? prevCh.startPage : 1);
    } else {
      this.goTo(this.page() - 1);
    }
  }

  next(): void {
    if (this.settings().mode === 'scroll') {
      const ch = chapterOf(this.chapters(), this.page());
      const nextCh = this.chapters().find((c) => c.index === ch.index + 1);
      this.goTo(nextCh ? nextCh.startPage : this.total());
    } else {
      this.goTo(this.page() + 1);
    }
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
    if (this.settings().mode !== 'page') return;
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

  private scrollToPage(page: number): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-page="${page}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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
    if (key === 'mode') setTimeout(() => this.scrollToPage(this.page()));
  }

  onFontSize(event: Event): void {
    this.setSetting('fontSize', Number((event.target as HTMLInputElement).value));
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

  segments(text: string, page: number) {
    return splitMarks(text, this.marksOf(page));
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
