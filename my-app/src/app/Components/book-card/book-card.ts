import { Component, input, signal } from '@angular/core';

import { BookView } from '../../models/book';

/** Thẻ sách dùng chung (Figma: Book card). Ảnh và tên luôn lấy từ cùng một object book. */
@Component({
  selector: 'app-book-card',
  standalone: false,
  styleUrl: './book-card.css',
  templateUrl: './book-card.html',
})
export class BookCard {
  readonly book = input.required<BookView>();

  protected readonly liked = signal(false);
}
