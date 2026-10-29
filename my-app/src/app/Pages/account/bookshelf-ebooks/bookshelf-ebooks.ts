import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';

import { ShelfStore, normalizeText } from '../shelf-store';
import { LibraryEbook, lastReadLabel, readLabel } from './bookshelf.mock';

type EbookFilter = 'all' | 'reading' | 'unread' | 'done';

export const EBOOK_FILTERS: { value: EbookFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'reading', label: 'Đang đọc' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'done', label: 'Đã đọc xong' },
];

const stateOf = (e: LibraryEbook): Exclude<EbookFilter, 'all'> => (e.progress >= 100 ? 'done' : e.progress > 0 ? 'reading' : 'unread');

/** Tủ sách – Sách điện tử (Figma "Pages/account/bookshelf-ebooks") */
@Component({
  selector: 'app-bookshelf-ebooks',
  standalone: false,
  styleUrls: ['../account-page.css', '../shelf.css', './bookshelf-ebooks.css'],
  templateUrl: './bookshelf-ebooks.html',
})
export class BookshelfEbooks implements OnInit {
  private readonly shelf = inject(ShelfStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly filters = EBOOK_FILTERS;
  readonly readLabel = readLabel;
  readonly status = this.shelf.status;
  readonly counts = this.shelf.counts;
  readonly query = signal('');
  readonly filter = signal<EbookFilter>('all');
  readonly downloading = signal<LibraryEbook | null>(null);

  /** "Đang đọc" gần nhất cho khối Đọc tiếp */
  readonly current = computed(() =>
    this.shelf
      .ebooks()
      .filter((e) => stateOf(e) === 'reading' && e.lastReadAt)
      .sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))[0] ?? null,
  );

  readonly visible = computed(() => {
    const q = normalizeText(this.query());
    const f = this.filter();
    return this.shelf
      .ebooks()
      .filter((e) => f === 'all' || stateOf(e) === f)
      .filter((e) => !q || normalizeText(`${e.title} ${e.author}`).includes(q));
  });

  ngOnInit(): void {
    this.shelf.load(this.destroyRef);
  }

  reload(): void {
    this.shelf.load(this.destroyRef);
  }

  progressText(e: LibraryEbook): string {
    return e.progress >= 100 ? 'Đã xong' : e.progress > 0 ? `${e.progress}%` : 'Chưa đọc';
  }

  pageText(e: LibraryEbook): string {
    return `Trang ${e.page} / ${e.totalPages} · đọc lần cuối ${lastReadLabel(e.lastReadAt)}`;
  }

  byline(e: LibraryEbook): string {
    return [e.author, e.translator ? `${e.translator} dịch` : ''].filter(Boolean).join(' · ');
  }
}
