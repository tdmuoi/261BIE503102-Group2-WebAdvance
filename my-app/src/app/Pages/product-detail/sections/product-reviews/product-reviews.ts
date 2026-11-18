import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { Review } from '../../../../models/book';
import { AuthService } from '../../../../services/auth-service';
import { BookService } from '../../../../services/book-service';
import { ToastService } from '../../../../services/toast-service';

const VISIBLE_COUNT = 3;
const AVATAR_TONES = ['pink', 'mint', 'yellow'] as const;
const dateFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Section "Đánh giá" nền vàng (Figma 873:5627): điểm trung bình, phân bố 1–5 sao, danh sách review.
 * my-server chưa có API đánh giá nên hiện tại luôn rơi vào trạng thái "Chưa có đánh giá".
 */
@Component({
  selector: 'app-product-reviews',
  standalone: false,
  styleUrls: ['../../../homepage/sections/section-shared.css', './product-reviews.css'],
  templateUrl: './product-reviews.html',
})
export class ProductReviews {
  readonly reviews = input<Review[]>([]);

  private readonly bookService = inject(BookService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Bản sao danh sách để cập nhật số vote ngay tại chỗ; đổi sách thì lấy lại từ input */
  protected readonly items = linkedSignal(() => this.reviews());
  /** Review có ảnh đại diện lỗi link → quay về chữ viết tắt */
  protected readonly brokenAvatars = signal<ReadonlySet<string>>(new Set());
  /** Review đang gửi vote (khoá nút, tránh bấm liên tục) */
  protected readonly pendingVote = signal<string | null>(null);

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly tones = AVATAR_TONES;

  protected readonly average = computed(() => {
    const list = this.reviews();
    return list.length ? list.reduce((sum, review) => sum + review.rating, 0) / list.length : 0;
  });

  /** % số đánh giá theo từng mức sao, 5 → 1 */
  protected readonly distribution = computed(() => {
    const list = this.reviews();
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      percent: list.length ? Math.round((list.filter((r) => Math.round(r.rating) === star).length / list.length) * 100) : 0,
    }));
  });

  /** Đổi sách thì thu gọn lại */
  protected readonly showAll = linkedSignal({ source: this.reviews, computation: () => false });

  protected readonly visible = computed(() => (this.showAll() ? this.items() : this.items().slice(0, VISIBLE_COUNT)));

  protected initials(name: string): string {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  protected markAvatarBroken(reviewId: string): void {
    this.brokenAvatars.update((set) => new Set(set).add(reviewId));
  }

  /** Bấm 👍 / 👎; bấm lại lựa chọn đang chọn thì bỏ vote */
  protected vote(review: Review, value: 1 | -1): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (review.isMine || this.pendingVote()) return;
    const next = review.myVote === value ? 0 : value;
    this.pendingVote.set(review._id);
    this.bookService
      .voteReview(review._id, next)
      .pipe(finalize(() => this.pendingVote.set(null)))
      .subscribe({
        next: (result) => this.items.update((list) => list.map((r) => (r._id === review._id ? { ...r, ...result } : r))),
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) {
            this.auth.expire();
            this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
            return;
          }
          this.toast.show(error.error?.message || 'Chưa ghi nhận được lựa chọn, vui lòng thử lại');
        },
      });
  }

  protected formatDate(value: string): string {
    return dateFormat.format(new Date(value));
  }
}
