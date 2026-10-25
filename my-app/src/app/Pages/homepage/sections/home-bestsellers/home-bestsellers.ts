import { Component, computed, input, linkedSignal } from '@angular/core';

import { BookView } from '../../../../models/book';

@Component({
  selector: 'app-home-bestsellers',
  standalone: false,
  styleUrls: ['../section-shared.css', './home-bestsellers.css'],
  templateUrl: './home-bestsellers.html',
})
export class HomeBestsellers {
  readonly books = input.required<BookView[]>();

  /**
   * Chưa có dữ liệu đơn hàng (collection orders trống) nên tạm lấy
   * 5 sách được cập nhật gần nhất.
   */
  protected readonly top = computed(() =>
    [...this.books()]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 5),
  );

  /** Vị trí sách đang xem ở panel bên phải */
  protected readonly selectedIndex = linkedSignal({ source: this.top, computation: () => 0 });

  protected readonly selected = computed<BookView | undefined>(() => this.top()[this.selectedIndex()]);

  /** Khoảng ngày của tuần hiện tại, ví dụ "20–26/10" */
  protected readonly weekLabel = (() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const pad = (value: number) => String(value).padStart(2, '0');
    const sameMonth = monday.getMonth() === sunday.getMonth();
    const start = sameMonth ? pad(monday.getDate()) : `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)}`;
    return `${start}–${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}`;
  })();

  protected select(index: number): void {
    this.selectedIndex.set(index);
  }
}
