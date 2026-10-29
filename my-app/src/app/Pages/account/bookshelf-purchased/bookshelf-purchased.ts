import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';

import { CatalogBook } from '../../../models/book';
import { BookService } from '../../../services/book-service';
import { readLabel } from '../bookshelf-ebooks/bookshelf.mock';
import { BuyAgainTarget } from '../popups/buy-again-drawer/buy-again-drawer';
import { ReviewTarget } from '../popups/review-popup/review-popup';
import { PurchasedBook, ShelfStore, normalizeText } from '../shelf-store';

type Kind = 'all' | PurchasedBook['kind'];
type Sort = 'newest' | 'oldest';

const PAGE_SIZE = 6;

/** Tủ sách – Sách đã mua (Figma "Pages/account/bookshelf-purchased") */
@Component({
  selector: 'app-bookshelf-purchased',
  standalone: false,
  styleUrls: ['../account-page.css', '../shelf.css', './bookshelf-purchased.css'],
  templateUrl: './bookshelf-purchased.html',
})
export class BookshelfPurchased implements OnInit {
  private readonly shelf = inject(ShelfStore);
  private readonly bookService = inject(BookService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = this.shelf.status;
  readonly counts = this.shelf.counts;
  readonly ratings = this.shelf.ratings;
  readonly query = signal('');
  readonly kind = signal<Kind>('all');
  readonly sort = signal<Sort>('newest');
  readonly shown = signal(PAGE_SIZE);

  readonly reviewing = signal<ReviewTarget | null>(null);
  readonly buying = signal<BuyAgainTarget | null>(null);

  readonly chips = computed(() => {
    const list = this.shelf.purchased();
    const n = (k: Kind) => list.filter((b) => b.kind === k).length;
    return [
      { value: 'all' as const, label: 'Tất cả', count: list.length },
      { value: 'new' as const, label: 'Sách mới', count: n('new') },
      { value: 'used' as const, label: 'Sách cũ', count: n('used') },
      { value: 'ebook' as const, label: 'Sách điện tử', count: n('ebook') },
    ];
  });

  readonly filtered = computed(() => {
    const q = normalizeText(this.query());
    const list = this.shelf
      .purchased()
      .filter((b) => this.kind() === 'all' || b.kind === this.kind())
      .filter((b) => !q || normalizeText(`${b.title} ${b.author} ${b.orderCode}`).includes(q));
    return this.sort() === 'newest' ? list : [...list].reverse();
  });

  readonly visible = computed(() => this.filtered().slice(0, this.shown()));
  readonly remaining = computed(() => Math.max(0, this.filtered().length - this.shown()));

  /** Gợi ý: sách bán chạy chưa mua */
  private readonly catalog = toSignal(
    this.bookService.getCatalog().pipe(
      map((c) => c.books),
      catchError(() => of<CatalogBook[]>([])),
    ),
    { initialValue: [] as CatalogBook[] },
  );
  readonly recommendations = computed(() => {
    const owned = new Set(this.shelf.purchased().map((b) => normalizeText(b.title)));
    return [...this.catalog()]
      .filter((b) => !owned.has(normalizeText(b.title)))
      .sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0))
      .slice(0, 5);
  });
  readonly basedOn = computed(() => {
    const titles = [...new Set(this.shelf.purchased().map((b) => b.title))];
    if (!titles.length) return '';
    const head = titles.slice(0, 2).map((t) => `“${t}”`).join(', ');
    return titles.length > 2 ? `Dựa trên ${head} và ${titles.length - 2} cuốn khác bạn đã mua` : `Dựa trên ${head} bạn đã mua`;
  });

  ngOnInit(): void {
    this.shelf.load(this.destroyRef);
  }

  reload(): void {
    this.shelf.load(this.destroyRef);
  }

  setKind(kind: Kind): void {
    this.kind.set(kind);
    this.shown.set(PAGE_SIZE);
  }

  onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as Sort);
  }

  readText(book: PurchasedBook): string {
    const ebook = this.shelf.ebooks().find((e) => e.bookId === book.bookId);
    return readLabel(ebook?.progress ?? 0);
  }

  review(book: PurchasedBook): void {
    const d = new Date(book.purchasedAt);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    this.reviewing.set({ bookId: book.bookId, title: book.title, image: book.image, author: book.author, meta: `${book.typeLabel} · mua ${date}` });
  }

  onReviewed(result: { bookId: string; rating: number }): void {
    this.shelf.setRating(result.bookId, result.rating);
  }

  buyAgain(book: PurchasedBook): void {
    this.buying.set({ _id: book.bookId, title: book.title, image: book.image, price: book.price });
  }
}
