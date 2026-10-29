import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith } from 'rxjs';

import { CatalogBook } from '../../../../models/book';
import { BookService } from '../../../../services/book-service';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; books: CatalogBook[] };

/**
 * Section "Có thể bạn cũng thích · you might also like" (Figma) — dùng ở Giỏ hàng, trang 404,
 * Đặt hàng thành công. Ưu tiên sách đang giảm giá, bỏ qua sách đã có trong giỏ (excludeIds).
 */
@Component({
  selector: 'app-suggested-books',
  standalone: false,
  styleUrl: './suggested-books.css',
  templateUrl: './suggested-books.html',
})
export class SuggestedBooks {
  private readonly bookService = inject(BookService);

  readonly excludeIds = input<string[]>([]);
  readonly limit = input(5);
  readonly subtitle = input('Chọn thêm vài cuốn để đủ điều kiện Freeship nhé.');

  private readonly state = toSignal(
    this.bookService.getCatalog().pipe(
      map((catalog): State => ({ status: 'ready', books: catalog.books })),
      catchError(() => of<State>({ status: 'error' })),
      startWith<State>({ status: 'loading' }),
    ),
    { initialValue: { status: 'loading' } as State },
  );

  readonly status = computed(() => this.state().status);

  readonly books = computed(() => {
    const s = this.state();
    if (s.status !== 'ready') return [];
    const exclude = new Set(this.excludeIds());
    return s.books
      .filter((b) => !exclude.has(b._id) && b.stock !== 0)
      .sort((a, b) => b.discountPercent - a.discountPercent || Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, this.limit());
  });
}
