import { Component, input } from '@angular/core';
import { Params } from '@angular/router';

import { CatalogBook } from '../../../../models/book';

/** Một hàng book-card có tiêu đề section — "Sách cùng tác giả", "Sách liên quan" (Figma 873:5722 / 873:5818) */
@Component({
  selector: 'app-book-row',
  standalone: false,
  styleUrls: ['../../../homepage/sections/section-shared.css', './book-row.css'],
  templateUrl: './book-row.html',
})
export class BookRow {
  readonly tag = input.required<string>();
  readonly title = input.required<string>();
  /** Chữ nghiêng Instrument Serif — chỉ tiếng Anh */
  readonly accent = input('');
  readonly books = input.required<CatalogBook[]>();
  /** Link bên phải, dẫn sang trang Browse với bộ lọc tương ứng */
  readonly linkLabel = input('');
  readonly linkQuery = input<Params>({});
}
