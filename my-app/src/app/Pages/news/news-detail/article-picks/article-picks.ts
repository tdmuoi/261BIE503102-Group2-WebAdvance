import { Component, computed, inject, input, signal } from '@angular/core';

import { CatalogBook } from '../../../../models/book';
import { NewsItem } from '../../../../models/content';
import { CartService } from '../../../../services/cart-service';
import { toInitials } from '../../../../services/author-directory-service';
import { ToastService } from '../../../../services/toast-service';
import { articleHtml, categoryLabel, fallbackCover, newsCover, newsDate } from '../../../../shared/news-utils';
import { TopicChip } from '../article-tags/article-tags';

/**
 * Bài dạng danh sách gợi ý đọc — Figma news-detail "Gợi ý đọc" (880:7637):
 * hero chia đôi (chữ trái, ảnh minh họa của bài phải), danh sách sách đánh số 01, 02…
 * kèm giá và nút thêm vào giỏ, khối combo trọn bộ.
 */
@Component({
  selector: 'app-article-picks',
  standalone: false,
  styleUrl: './article-picks.css',
  templateUrl: './article-picks.html',
})
export class ArticlePicks {
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);

  readonly article = input.required<NewsItem>();
  readonly books = input.required<CatalogBook[]>();
  readonly chips = input<TopicChip[]>([]);

  private readonly coverFailed = signal(false);

  protected readonly cover = computed(() => (this.coverFailed() ? fallbackCover(this.article()) : newsCover(this.article())));
  protected readonly date = computed(() => newsDate(this.article()));
  protected readonly category = computed(() => (this.article().category ? categoryLabel(this.article().category!) : ''));
  protected readonly html = computed(() => articleHtml(this.article()));
  protected readonly authorInitials = computed(() => (this.article().author?.name ? toInitials(this.article().author!.name) : ''));

  /** Combo: các cuốn còn hàng, giá thật cộng lại */
  protected readonly combo = computed(() => {
    const inStock = this.books().filter((book) => book.stock > 0);
    const price = inStock.reduce((sum, book) => sum + book.price, 0);
    const original = inStock.reduce((sum, book) => sum + Math.max(book.originalPrice || 0, book.price), 0);
    return { books: inStock, price, original, saving: original > price ? Math.round((1 - price / original) * 100) : 0 };
  });

  protected onCoverError(): void {
    this.coverFailed.set(true);
  }

  protected addToCart(book: CatalogBook): void {
    this.cart.add(book, 1);
    this.toast.show(`Đã thêm “${book.title}” vào giỏ.`, { label: 'Xem giỏ hàng', path: '/cart' });
  }

  protected addCombo(): void {
    const { books } = this.combo();
    books.forEach((book) => this.cart.add(book, 1));
    this.toast.show(`Đã thêm ${books.length} cuốn vào giỏ.`, { label: 'Xem giỏ hàng', path: '/cart' });
  }
}
