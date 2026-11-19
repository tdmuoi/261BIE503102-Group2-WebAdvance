import { Component, DestroyRef, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { Catalog, CatalogBook, Review } from '../../models/book';
import { BookService } from '../../services/book-service';
import { CartService } from '../../services/cart-service';
import { ToastService } from '../../services/toast-service';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

const HIDDEN_CATEGORY_SLUGS = ['uncategorized', 'used-book', 'ebook'];
const ROW_SIZE = 5;

@Component({
  selector: 'app-product-detail',
  standalone: false,
  styleUrl: './product-detail.css',
  templateUrl: './product-detail.html',
})
export class ProductDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookService = inject(BookService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  protected readonly state = signal<LoadState>('loading');
  private readonly catalog = signal<Catalog | null>(null);
  protected readonly book = signal<CatalogBook | null>(null);
  protected readonly reviews = signal<Review[]>([]);

  protected readonly inCart = computed(() => {
    const book = this.book();
    return book ? this.cart.quantityOf(book._id) : 0;
  });

  protected readonly maxQuantity = computed(() => {
    const book = this.book();
    const limit = book?.type === 'ebook' ? (book.ebookReady === false ? 0 : 1) : (book?.stock ?? 0);
    return Math.max(0, limit - this.inCart());
  });

  protected readonly quantity = linkedSignal({ source: this.book, computation: () => 1 });

  protected readonly category = computed(() => {
    const book = this.book();
    return book && !HIDDEN_CATEGORY_SLUGS.includes(book.categorySlug)
      ? { slug: book.categorySlug, name: book.categoryName }
      : null;
  });

  protected readonly sameAuthor = computed(() => {
    const book = this.book();
    if (!book?.authorId) return [];
    return this.otherBooks().filter((other) => other.authorId === book.authorId).slice(0, ROW_SIZE);
  });

  protected readonly related = computed(() => {
    const book = this.book();
    if (!book) return [];
    const shown = new Set(this.sameAuthor().map((other) => other._id));
    const candidates = this.otherBooks().filter((other) => !shown.has(other._id));
    const sameCategory = this.category() ? candidates.filter((other) => other.categorySlug === book.categorySlug) : [];
    const sameType = candidates.filter((other) => other.type === book.type && !sameCategory.includes(other));
    return [...sameCategory, ...sameType].slice(0, ROW_SIZE);
  });

  constructor() {
    const previousTitle = this.title.getTitle();
    this.destroyRef.onDestroy(() => this.title.setTitle(previousTitle));

    combineLatest([this.route.paramMap, this.reload$])
      .pipe(
        map(([params]) => params.get('slug') ?? ''),
        tap(() => this.state.set('loading')),
        switchMap((slug) =>
          this.bookService.getCatalog().pipe(
            map((catalog) => ({ catalog, book: findBook(catalog, slug) })),
            catchError((error) => {
              console.error('Không tải được sách:', error);
              return of(null);
            }),
          ),
        ),
        switchMap((result) =>
          result?.book
            ? this.bookService.getReviews(result.book._id).pipe(map((reviews) => ({ ...result, reviews })))
            : of(result && { ...result, reviews: [] }),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.catalog.set(result?.catalog ?? null);
        this.book.set(result?.book ? withRating(result.book, result.reviews) : null);
        this.reviews.set(result?.reviews ?? []);
        if (!result) {
          this.state.set('error');
        } else if (!result.book) {
          this.state.set('not-found');
          this.title.setTitle('Không tìm thấy sách | Lightbook');
        } else {
          this.state.set('ready');
          this.title.setTitle(`${result.book.title} | Lightbook`);
        }
      });
  }

  protected retry(): void {
    this.reload$.next();
  }

  protected addToCart(): void {
    const book = this.book();
    const quantity = Math.min(this.quantity(), this.maxQuantity());
    if (!book || quantity <= 0) return;
    this.cart.add(book, quantity);
    this.quantity.set(1);
    this.toast.show(`Đã thêm ${quantity} cuốn vào giỏ`, { label: 'Xem giỏ hàng', path: '/cart' });
  }

  protected buyNow(): void {
    const book = this.book();
    if (!book) return;
    const quantity = Math.min(this.quantity(), this.maxQuantity());
    if (quantity > 0) this.cart.add(book, quantity);
    this.router.navigate(['/cart']);
  }

  protected async share(): Promise<void> {
    const book = this.book();
    if (!book) return;
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: book.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.toast.show('Đã sao chép liên kết sách');
    } catch {
    }
  }

  private otherBooks(): CatalogBook[] {
    const book = this.book();
    return (this.catalog()?.books ?? []).filter((other) => other._id !== book?._id);
  }
}

function findBook(catalog: Catalog, slug: string): CatalogBook | null {
  return catalog.books.find((book) => book.slug === slug || book._id === slug) ?? null;
}

function withRating(book: CatalogBook, reviews: Review[]): CatalogBook {
  if (!reviews.length) return book;
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return { ...book, rating: Math.round(average * 10) / 10, reviewCount: reviews.length };
}
