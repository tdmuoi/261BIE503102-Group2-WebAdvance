import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';

import { ItemFormat, Order } from '../../models/account';
import { AccountService } from '../../services/account-service';
import { WishlistService } from '../../services/wishlist-service';
import { LibraryEbook } from './bookshelf-ebooks/library';

export interface PurchasedBook {
  key: string;
  bookId: string;
  title: string;
  author: string;
  image: string;
  price: number;
  format: ItemFormat;
  kind: 'new' | 'used' | 'ebook';
  typeLabel: string;
  orderCode: string;
  purchasedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ShelfStore {
  private readonly account = inject(AccountService);
  private readonly wishlist = inject(WishlistService);

  readonly status = signal<'loading' | 'error' | 'ready'>('loading');
  readonly orders = signal<Order[]>([]);
  readonly ebooks = signal<LibraryEbook[]>([]);
  readonly ratings = signal<Record<string, number>>({});

  readonly purchased = computed<PurchasedBook[]>(() =>
    this.orders()
      .filter((o) => !['pending', 'cancelled', 'returned'].includes(o.status))
      .flatMap((o) =>
        o.items.map((i) => {
          const kind = i.format === 'ebook' ? 'ebook' : /cũ/i.test(i.variant ?? '') ? 'used' : 'new';
          return {
            key: `${o._id}-${i.bookId}`, bookId: i.bookId, title: i.title, author: i.author ?? '', image: i.image ?? '', price: i.price,
            format: i.format, kind, typeLabel: kind === 'ebook' ? 'Sách điện tử' : (i.variant ?? 'Sách mới'), orderCode: o.orderCode, purchasedAt: o.createdAt,
          } as PurchasedBook;
        }),
      )
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
  );

  readonly counts = computed(() => ({ ebooks: this.ebooks().length, purchased: this.purchased().length, wishlist: this.wishlist.count() }));

  load(destroyRef?: DestroyRef): void {
    this.status.set('loading');
    const sub = forkJoin({
      orders: this.account.getOrders(),
      ebooks: this.account.getEbooks<LibraryEbook>(),
      ratings: this.account.getMyRatings().pipe(catchError(() => of<Record<string, number>>({}))),
    }).subscribe({
      next: ({ orders, ebooks, ratings }) => {
        this.orders.set(orders);
        this.ebooks.set(ebooks);
        this.ratings.set(ratings);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
    destroyRef?.onDestroy(() => sub.unsubscribe());
  }

  setRating(bookId: string, rating: number): void {
    this.ratings.update((r) => ({ ...r, [bookId]: rating }));
  }
}

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}
