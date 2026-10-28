import { Component, computed, input, linkedSignal, signal } from '@angular/core';

import { BookImage, CatalogBook } from '../../../../models/book';

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

  /** Chưa có API danh sách yêu thích — chỉ đổi trạng thái tại chỗ như book-card */
  protected readonly liked = signal(false);
}
