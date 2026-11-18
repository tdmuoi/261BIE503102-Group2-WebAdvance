import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { startWith, switchMap } from 'rxjs';

import { BookView, Review } from '../../../../models/book';
import { BookService } from '../../../../services/book-service';
import { WishlistService } from '../../../../services/wishlist-service';

/** Panel chi tiết bên phải section "Bán chạy tuần này" */
@Component({
  selector: 'app-home-best-panel',
  standalone: false,
  styleUrl: './home-best-panel.css',
  templateUrl: './home-best-panel.html',
})
export class HomeBestPanel {
  readonly book = input.required<BookView>();
  /** Thứ hạng trong top 5 */
  readonly rank = input.required<number>();

  private readonly wishlist = inject(WishlistService);
  private readonly bookService = inject(BookService);

  /** Yêu thích lưu qua WishlistService (đăng nhập thì lưu theo tài khoản) — đồng bộ với trang Wishlist */
  protected readonly liked = computed(() => this.wishlist.has(this.book()._id));

  /**
   * Đánh giá thật của cuốn đang chọn (GET /api/books/:id/reviews — cùng API với trang chi tiết).
   * Bấm sang cuốn khác ở danh sách bên trái thì tải lại; null = đang tải.
   */
  protected readonly reviews = toSignal(
    toObservable(computed(() => this.book()._id)).pipe(
      switchMap((id) => this.bookService.getReviews(id).pipe(startWith<Review[] | null>(null))),
    ),
    { initialValue: null },
  );

  protected readonly loading = computed(() => this.reviews() === null);
  protected readonly reviewCount = computed(() => this.reviews()?.length ?? 0);

  /** Điểm trung bình, 0 nếu chưa có đánh giá */
  protected readonly average = computed(() => {
    const list = this.reviews() ?? [];
    return list.length ? list.reduce((sum, r) => sum + Number(r.rating || 0), 0) / list.length : 0;
  });

  /** 2 đánh giá mới nhất hiển thị trong panel */
  protected readonly latest = computed(() =>
    [...(this.reviews() ?? [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2),
  );

  /** Chuỗi sao, ví dụ 4.3 → "★★★★☆" */
  protected stars(value: number): string {
    const full = Math.max(0, Math.min(5, Math.round(value)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  protected formatDate(value: string): string {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN');
  }

  protected toggleLike(): void {
    const b = this.book();
    this.wishlist.toggle({ _id: b._id, title: b.title, image: b.image, price: b.price });
  }
}
