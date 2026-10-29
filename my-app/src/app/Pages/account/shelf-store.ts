import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { ItemFormat, Order } from '../../models/account';
import { AccountService } from '../../services/account-service';
import { WishlistService } from '../../services/wishlist-service';
import { LibraryEbook, USE_MOCK_EBOOKS, mockGetEbooks } from './bookshelf-ebooks/bookshelf.mock';
import { USE_MOCK_ORDERS, mockGetOrders } from './orders/orders.mock';
import { USE_MOCK_REVIEWS, mockGetMyRatings } from './popups/review-popup/review.mock';
import { seedDemoWishlist } from './wishlist/wishlist.mock';

/** Một cuốn trong "Sách đã mua" */
export interface PurchasedBook {
  key: string;
  bookId: string;
  title: string;
  author: string;
  image: string;
  price: number;
  format: ItemFormat;
  kind: 'new' | 'used' | 'ebook';
  /** "Sách mới" / "Sách cũ · 90% mới" / "Sách điện tử" */
  typeLabel: string;
  orderCode: string;
  purchasedAt: string;
}

/**
 * Dữ liệu dùng chung cho 3 tab Tủ sách (Sách điện tử / Sách đã mua / Wishlist):
 * đơn hàng, thư viện ebook, số sao đã đánh giá và số đếm trên tab.
 */
@Injectable({ providedIn: 'root' })
export class ShelfStore {
  private readonly account = inject(AccountService);
  private readonly wishlist = inject(WishlistService);

  readonly status = signal<'loading' | 'error' | 'ready'>('loading');
  readonly orders = signal<Order[]>([]);
  readonly ebooks = signal<LibraryEbook[]>([]);
  readonly ratings = signal<Record<string, number>>({});

  /** Sách trong các đơn đã xác nhận trở đi (đơn chờ xác nhận / đã huỷ không tính), mới nhất trước */
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
    seedDemoWishlist(); // chỉ ghi khi đang dùng dữ liệu mẫu và người dùng chưa có wishlist
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/account/orders, /ebooks, /reviews
    const sub = forkJoin({
      orders: USE_MOCK_ORDERS ? mockGetOrders() : this.account.getOrders(),
      ebooks: USE_MOCK_EBOOKS ? mockGetEbooks() : this.account.getEbooks<LibraryEbook>(),
      ratings: USE_MOCK_REVIEWS ? mockGetMyRatings() : this.account.getMyRatings(),
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

/** Bỏ dấu + chữ thường để tìm kiếm */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}
