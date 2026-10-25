import { Component, input, signal } from '@angular/core';

import { BookView } from '../../../../models/book';

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

  protected readonly liked = signal(false);
}
