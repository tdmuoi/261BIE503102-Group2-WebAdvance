import { Component, computed, input, model, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

@Component({
  selector: 'app-product-info',
  standalone: false,
  styleUrl: './product-info.css',
  templateUrl: './product-info.html',
})
export class ProductInfo {
  readonly book = input.required<CatalogBook>();
  readonly category = input<{ slug: string; name: string } | null>(null);
  readonly inCart = input(0);
  readonly maxQuantity = input(0);
  readonly quantity = model(1);

  readonly add = output<void>();
  readonly buy = output<void>();
  readonly share = output<void>();

  protected readonly stars = [1, 2, 3, 4, 5];

  protected readonly initials = computed(() => {
    const words = this.book().authorName.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  });

  protected readonly isEbook = computed(() => this.book().type === 'ebook');

  protected readonly stockText = computed(() => {
    const stock = this.book().stock;
    if (stock <= 0) return 'Tạm hết hàng';
    if (this.maxQuantity() <= 0) return `Bạn đã thêm hết ${stock} cuốn còn trong kho`;
    return `Còn ${stock} cuốn trong kho`;
  });

  protected readonly soldText = computed(() => {
    const sold = this.book().soldCount ?? 0;
    return sold >= 1000 ? `${(sold / 1000).toFixed(1).replace('.', ',')}k` : String(sold);
  });
}
