import { Component, computed, model } from '@angular/core';

import { PRICE_MAX, PRICE_STEP } from '../../browse-query';

const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

@Component({
  selector: 'app-browse-price',
  standalone: false,
  styleUrl: './browse-price.css',
  templateUrl: './browse-price.html',
})
export class BrowsePrice {
  readonly min = model.required<number>();
  readonly max = model.required<number>();

  protected readonly priceMax = PRICE_MAX;
  protected readonly priceStep = PRICE_STEP;

  protected readonly fill = computed(() => ({
    left: (this.min() / PRICE_MAX) * 100,
    right: 100 - (this.max() / PRICE_MAX) * 100,
  }));

  protected format(value: number, isMax = false): string {
    return isMax && value >= PRICE_MAX ? `${formatter.format(PRICE_MAX)}đ+` : `${formatter.format(value)}đ`;
  }

  protected onSlide(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = String(this.set(which, Number(input.value)));
  }

  protected onInput(which: 'min' | 'max', event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const value = digits ? Number(digits) : which === 'min' ? 0 : PRICE_MAX;
    input.value = this.format(this.set(which, Math.min(value, PRICE_MAX)), which === 'max');
  }

  private set(which: 'min' | 'max', value: number): number {
    if (which === 'min') {
      this.min.set(Math.min(value, this.max()));
      return this.min();
    }
    this.max.set(Math.max(value, this.min()));
    return this.max();
  }
}
