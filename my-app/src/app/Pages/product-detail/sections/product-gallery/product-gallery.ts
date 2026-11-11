import { Component, computed, inject, input, linkedSignal } from '@angular/core';

import { BookImage, CatalogBook } from '../../../../models/book';
import { WishlistService } from '../../../../services/wishlist-service';

/**
 * Ảnh lớn + badge giảm giá + nút yêu thích, bên dưới là ảnh nhỏ có nhãn (Figma "Gallery" 873:5445).
 * DB hiện chỉ có 1 ảnh bìa nên hàng ảnh nhỏ chỉ hiện khi sách có từ 2 ảnh (field images[]).
 * Sticker "Bestseller" trong Figma chưa làm vì DB chưa có dữ liệu bán chạy.
 */
@Component({
  selector: 'app-product-gallery',
  standalone: false,
  styleUrl: './product-gallery.css',
  templateUrl: './product-gallery.html',
})
export class ProductGallery {
  readonly book = input.required<CatalogBook>();

  protected readonly images = computed<BookImage[]>(() => {
    const book = this.book();
    return book.images?.length ? book.images : [{ url: book.image, label: 'Bìa trước' }];
  });

  /** Đổi sách thì quay về ảnh đầu */
  protected readonly selected = linkedSignal({ source: this.images, computation: () => 0 });

  private readonly wishlist = inject(WishlistService);

  /** Yêu thích lưu qua WishlistService (đăng nhập thì lưu theo tài khoản) — đồng bộ với trang Wishlist */
  protected readonly liked = computed(() => this.wishlist.has(this.book()._id));

  protected toggleLike(): void {
    const b = this.book();
    this.wishlist.toggle({ _id: b._id, title: b.title, image: b.image, price: b.price });
  }
}
