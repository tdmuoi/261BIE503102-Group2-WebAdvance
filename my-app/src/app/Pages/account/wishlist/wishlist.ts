import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { CatalogBook } from '../../../models/book';
import { BookService } from '../../../services/book-service';
import { ToastService } from '../../../services/toast-service';
import { WishlistItem, WishlistService } from '../../../services/wishlist-service';
import { CartFacade } from '../../cart/cart-facade';
import { ShelfStore, normalizeText } from '../shelf-store';
import { DEMO_DETAILS } from './wishlist.mock';

export interface WishlistCard {
  bookId: string;
  title: string;
  author: string;
  image: string;
  price: number;
  originalPrice: number;
  discountPercent: number;
  type?: string;
}

/** Tủ sách – Wishlist (Figma "Pages/account/wishlist") */
@Component({
  selector: 'app-wishlist',
  standalone: false,
  styleUrls: ['../account-page.css', '../shelf.css', './wishlist.css'],
  templateUrl: './wishlist.html',
})
export class Wishlist implements OnInit {
  private readonly shelf = inject(ShelfStore);
  private readonly wishlist = inject(WishlistService);
  private readonly bookService = inject(BookService);
  private readonly cart = inject(CartFacade);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly counts = this.shelf.counts;
  readonly query = signal('');

  /** null = đang tải danh mục */
  private readonly catalog = toSignal(
    this.bookService.getCatalog().pipe(
      map((c) => new Map(c.books.map((b) => [b._id, b] as const))),
      catchError(() => of(new Map<string, CatalogBook>())),
    ),
    { initialValue: null },
  );
  readonly loading = computed(() => this.catalog() === null);

  /** Ghép wishlist với danh mục để có giá hiện tại, giảm giá, tác giả */
  readonly cards = computed<WishlistCard[]>(() => {
    const catalog = this.catalog() ?? new Map<string, CatalogBook>();
    return this.wishlist.items().map((item) => toCard(item, catalog.get(item.bookId)));
  });
  readonly onSale = computed(() => this.cards().filter((c) => c.discountPercent > 0).length);
  readonly visible = computed(() => {
    const q = normalizeText(this.query());
    return this.cards().filter((c) => !q || normalizeText(`${c.title} ${c.author}`).includes(q));
  });

  ngOnInit(): void {
    this.shelf.load(this.destroyRef);
  }

  remove(card: WishlistCard): void {
    this.wishlist.remove(card.bookId);
    this.toast.show(`Đã bỏ “${card.title}” khỏi wishlist`);
  }

  addToCart(card: WishlistCard): void {
    this.cart.addBook({ _id: card.bookId, title: card.title, image: card.image, price: card.price, type: card.type });
    this.toast.show(`Đã thêm “${card.title}” vào giỏ`, { label: 'Xem giỏ', path: '/cart' });
  }

  buyNow(card: WishlistCard): void {
    this.cart.addBook({ _id: card.bookId, title: card.title, image: card.image, price: card.price, type: card.type });
    this.router.navigateByUrl('/cart');
  }

  addAll(): void {
    const list = this.cards();
    list.forEach((c) => this.cart.addBook({ _id: c.bookId, title: c.title, image: c.image, price: c.price, type: c.type }));
    this.toast.show(`Đã thêm ${list.length} cuốn vào giỏ`, { label: 'Xem giỏ', path: '/cart' });
  }
}

function toCard(item: WishlistItem, book: CatalogBook | undefined): WishlistCard {
  const demo = DEMO_DETAILS[item.bookId];
  const price = book?.price ?? item.price;
  const originalPrice = book?.originalPrice ?? demo?.originalPrice ?? price;
  return {
    bookId: item.bookId,
    title: book?.title ?? item.title,
    author: book?.authorName ?? demo?.author ?? '',
    image: book?.image ?? item.image,
    price,
    originalPrice,
    discountPercent: book?.discountPercent ?? (originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0),
    type: book?.type,
  };
}
