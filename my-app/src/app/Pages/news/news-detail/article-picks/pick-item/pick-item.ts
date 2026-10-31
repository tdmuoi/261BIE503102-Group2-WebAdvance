import { Component, computed, input, output } from '@angular/core';

import { CatalogBook } from '../../../../../models/book';

/** Một cuốn trong bài gợi ý đọc: số thứ tự, bìa sách thật, tên, tác giả, giá, thêm vào giỏ — Figma 880:7755 */
@Component({
  selector: 'app-pick-item',
  standalone: false,
  styleUrl: './pick-item.css',
  templateUrl: './pick-item.html',
})
export class PickItem {
  readonly book = input.required<CatalogBook>();
  readonly index = input.required<number>();

  readonly add = output<CatalogBook>();

  protected readonly number = computed(() => (this.index() + 1).toString().padStart(2, '0'));
  protected readonly link = computed(() => ['/books', this.book().slug || this.book()._id]);
}
