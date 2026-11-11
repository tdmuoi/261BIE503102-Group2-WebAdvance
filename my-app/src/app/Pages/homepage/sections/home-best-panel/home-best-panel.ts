import { Component, computed, inject, input } from '@angular/core';

import { BookView } from '../../../../models/book';
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

  /** Yêu thích lưu qua WishlistService (đăng nhập thì lưu theo tài khoản) — đồng bộ với trang Wishlist */
  protected readonly liked = computed(() => this.wishlist.has(this.book()._id));

  protected toggleLike(): void {
    const b = this.book();
    this.wishlist.toggle({ _id: b._id, title: b.title, image: b.image, price: b.price });
  }
}
