import { Component, computed, inject, input, signal } from '@angular/core';

import { BookView } from '../../../../../models/book';
import { comboPrice } from '../../../../../services/combo-service';
import { ToastService } from '../../../../../services/toast-service';
import { CartFacade } from '../../../../cart/cart-facade';

const SLOT_COUNT = 3;
const MIN_BOOKS = 2;

/**
 * "Tự chọn combo của riêng bạn": 3 ô "+", mỗi ô mở bảng chọn 1 cuốn.
 * Đủ 2–3 cuốn thì hiện giá combo (giảm thêm 10%, freeship) và thêm cả combo vào giỏ.
 */
@Component({
  selector: 'app-custom-combo',
  standalone: false,
  styleUrls: ['../../section-shared.css', './custom-combo.css'],
  templateUrl: './custom-combo.html',
})
export class CustomCombo {
  private readonly facade = inject(CartFacade);
  private readonly toast = inject(ToastService);

  readonly books = input.required<BookView[]>();

  protected readonly minBooks = MIN_BOOKS;
  protected readonly slots = signal<(BookView | null)[]>(Array(SLOT_COUNT).fill(null));
  /** Ô đang chọn sách (bảng chọn mở), null = đóng */
  protected readonly activeSlot = signal<number | null>(null);

  protected readonly chosen = computed(() => this.slots().filter((book): book is BookView => !!book));

  /** Sách chọn được: sách giấy còn hàng, chưa nằm trong ô khác */
  protected readonly candidates = computed(() => {
    const taken = new Set(this.chosen().map((book) => book._id));
    return this.books().filter((book) => book.stock > 0 && book.bookType !== 'ebook' && !taken.has(book._id));
  });

  protected readonly summary = computed(() => {
    const books = this.chosen();
    const sale = books.reduce((sum, book) => sum + book.price, 0);
    const original = books.reduce((sum, book) => sum + Math.max(book.originalPrice || 0, book.price), 0);
    const price = comboPrice(sale);
    return { count: books.length, price, original, saving: original - price };
  });

  protected openSlot(index: number): void {
    this.activeSlot.set(index);
  }

  protected pick(book: BookView): void {
    const index = this.activeSlot();
    if (index === null) return;
    this.slots.update((slots) => slots.map((slot, i) => (i === index ? book : slot)));
    this.activeSlot.set(null);
  }

  protected clear(index: number): void {
    this.slots.update((slots) => slots.map((slot, i) => (i === index ? null : slot)));
  }

  protected closePicker(): void {
    this.activeSlot.set(null);
  }

  protected addToCart(): void {
    const books = this.chosen();
    if (books.length < MIN_BOOKS) return;
    this.facade.addCombo('Combo tự chọn', books, true);
    this.toast.show(`Đã thêm combo ${books.length} cuốn vào giỏ, giảm thêm 10%.`, { label: 'Xem giỏ hàng', path: '/cart' });
    this.slots.set(Array(SLOT_COUNT).fill(null));
  }
}
