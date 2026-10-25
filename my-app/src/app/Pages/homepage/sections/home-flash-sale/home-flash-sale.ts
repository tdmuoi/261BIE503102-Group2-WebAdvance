import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';

import { BookView } from '../../../../models/book';

/** Các khung giờ flash sale trong ngày (giờ bắt đầu, giờ kết thúc) */
const SALE_SLOTS: ReadonlyArray<[number, number]> = [
  [8, 12],
  [12, 18],
  [18, 24],
];

interface Countdown {
  /** running: đang diễn ra, upcoming: chưa tới khung đầu tiên */
  mode: 'running' | 'upcoming';
  slotLabel: string;
  hours: string;
  minutes: string;
  seconds: string;
}

@Component({
  selector: 'app-home-flash-sale',
  standalone: false,
  styleUrls: ['../section-shared.css', './home-flash-sale.css'],
  templateUrl: './home-flash-sale.html',
})
export class HomeFlashSale {
  /** Toàn bộ sách đã tải; section tự lọc sách đang giảm giá */
  readonly books = input.required<BookView[]>();

  /** 5 sách giảm sâu nhất; cùng mức giảm thì ưu tiên sách tiết kiệm được nhiều tiền hơn */
  protected readonly deals = computed(() =>
    this.books()
      .filter((book) => book.discountPercent > 0)
      .sort(
        (a, b) =>
          b.discountPercent - a.discountPercent ||
          b.originalPrice - b.price - (a.originalPrice - a.price),
      )
      .slice(0, 5),
  );

  protected readonly maxDiscount = computed(() =>
    this.deals().reduce((max, book) => Math.max(max, book.discountPercent), 0),
  );

  // Màu nền ô ảnh và góc nghiêng của từng thẻ, lặp theo thứ tự như Figma
  protected readonly tints = ['mint', 'yellow', 'pink', 'mint', 'yellow'];
  protected readonly tilts = [2, -1.5, 1.5, -2, 2];

  protected readonly countdown = signal<Countdown>(this.computeCountdown());

  constructor() {
    const timer = setInterval(() => this.countdown.set(this.computeCountdown()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }


  private computeCountdown(): Countdown {
    const now = new Date();
    const hour = now.getHours();
    const current = SALE_SLOTS.find(([start, end]) => hour >= start && hour < end);
    const slot = current ?? SALE_SLOTS[0];

    const target = new Date(now);
    target.setHours(current ? slot[1] : slot[0], 0, 0, 0);

    const remaining = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    const pad = (value: number) => String(value).padStart(2, '0');

    return {
      mode: current ? 'running' : 'upcoming',
      slotLabel: `${pad(slot[0])}:00 – ${pad(slot[1])}:00`,
      hours: pad(Math.floor(remaining / 3600)),
      minutes: pad(Math.floor((remaining % 3600) / 60)),
      seconds: pad(remaining % 60),
    };
  }
}
