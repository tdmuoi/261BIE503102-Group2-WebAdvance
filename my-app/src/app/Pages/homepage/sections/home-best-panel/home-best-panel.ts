import { Component, input, linkedSignal } from '@angular/core';

import { BookView } from '../../../../models/book';

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

  /** Trạng thái yêu thích; đổi sách thì bỏ chọn */
  protected readonly liked = linkedSignal({ source: this.book, computation: () => false });
}
