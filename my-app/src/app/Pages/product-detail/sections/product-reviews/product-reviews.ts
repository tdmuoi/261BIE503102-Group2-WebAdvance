import { Component, computed, input, linkedSignal } from '@angular/core';

import { Review } from '../../../../models/book';

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

  protected readonly visible = computed(() => (this.showAll() ? this.reviews() : this.reviews().slice(0, VISIBLE_COUNT)));

  protected initials(name: string): string {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  protected formatDate(value: string): string {
    return dateFormat.format(new Date(value));
  }
}
