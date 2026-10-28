import { Component, computed, model } from '@angular/core';

import { PRICE_MAX, PRICE_STEP } from '../../browse-query';

const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** Nhóm "Khoảng giá" trong sidebar lọc: thanh trượt 2 đầu + ô Từ / Đến (Figma 893:10023) */
@Component({
  selector: 'app-browse-price',
  standalone: false,
  styleUrl: './browse-price.css',
  templateUrl: './browse-price.html',
})
export class BrowsePrice {
  readonly min = model.required<number>();
  /** Bằng PRICE_MAX nghĩa là không giới hạn trên ("500.000đ+") */
  readonly max = model.required<number>();

  protected readonly priceMax = PRICE_MAX;
  protected readonly priceStep = PRICE_STEP;

  /** Phần tô đậm giữa 2 nút kéo, tính theo % */
  protected readonly fill = computed(() => ({
    left: (this.min() / PRICE_MAX) * 100,
    right: 100 - (this.max() / PRICE_MAX) * 100,
  }));

  protected format(value: number, isMax = false): string {
    return isMax && value >= PRICE_MAX ? `${formatter.format(PRICE_MAX)}đ+` : `${formatter.format(value)}đ`;
  }

  /** Kéo thanh trượt — 2 nút không vượt qua nhau */
  protected onSlide(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = String(this.set(which, Number(input.value)));
  }

  /** Gõ vào ô Từ / Đến — chỉ lấy chữ số, "50.000đ" hay "50000" đều được */
  protected onInput(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const value = digits ? Number(digits) : which === 'min' ? 0 : PRICE_MAX;
    input.value = this.format(this.set(which, Math.min(value, PRICE_MAX)), which === 'max');
  }

  /** Ghi giá trị đã chặn trong khoảng hợp lệ, trả về giá trị thật được ghi */
  private set(which: 'min' | 'max', value: number): number {
    if (which === 'min') {
      this.min.set(Math.min(value, this.max()));
      return this.min();
    }
    this.max.set(Math.max(value, this.min()));
    return this.max();
  }
}
