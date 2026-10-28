import { Component, computed, input, model, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

/**
 * Khối thông tin + mua hàng bên phải ảnh (Figma "Info" 873:5471).
 * Rating, đã bán, dịch giả, mô tả ngắn chỉ hiện khi DB có dữ liệu; badge "Bán chạy" chưa làm vì chưa có dữ liệu.
 */
@Component({
  selector: 'app-product-info',
  standalone: false,
  styleUrl: './product-info.css',
  templateUrl: './product-info.html',
})
export class ProductInfo {
  readonly book = input.required<CatalogBook>();
  /** Thể loại để hiện tag (null nếu "Chưa phân loại") */
  readonly category = input<{ slug: string; name: string } | null>(null);
  /** Số cuốn đã có trong giỏ */
  readonly inCart = input(0);
  /** Số cuốn còn thêm được vào giỏ */
  readonly maxQuantity = input(0);
  readonly quantity = model(1);

  readonly add = output<void>();
  readonly buy = output<void>();
  readonly share = output<void>();

  protected readonly stars = [1, 2, 3, 4, 5];

  /** Chữ cái đầu tên tác giả cho avatar: "Fredrik Backman" → "FB" */
  protected readonly initials = computed(() => {
    const words = this.book().authorName.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  });

  protected readonly stockText = computed(() => {
    const stock = this.book().stock;
    if (stock <= 0) return 'Tạm hết hàng';
    if (this.maxQuantity() <= 0) return `Bạn đã thêm hết ${stock} cuốn còn trong kho`;
    return `Còn ${stock} cuốn trong kho`;
  });

  /** "Đã bán 3,2k" */
  protected readonly soldText = computed(() => {
    const sold = this.book().soldCount ?? 0;
    return sold >= 1000 ? `${(sold / 1000).toFixed(1).replace('.', ',')}k` : String(sold);
  });
}
