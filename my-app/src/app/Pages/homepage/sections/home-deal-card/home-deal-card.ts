import { Component, computed, inject, input } from '@angular/core';

import { BookView } from '../../../../models/book';
import { WishlistService } from '../../../../services/wishlist-service';

/** Thẻ sách giảm giá trong section Flash Sale */
@Component({
  selector: 'app-home-deal-card',
  standalone: false,
  styleUrl: './home-deal-card.css',
  templateUrl: './home-deal-card.html',
})
export class HomeDealCard {
  readonly deal = input.required<BookView>();
  /** Màu nền ô ảnh: mint | yellow | pink */
  readonly tint = input('mint');

  private readonly wishlist = inject(WishlistService);

  /** Yêu thích lưu qua WishlistService (đăng nhập thì lưu theo tài khoản) — đồng bộ với trang Wishlist */
  protected readonly liked = computed(() => this.wishlist.has(this.deal()._id));

  protected toggleLike(): void {
    const b = this.deal();
    this.wishlist.toggle({ _id: b._id, title: b.title, image: b.image, price: b.price });
  }
}
