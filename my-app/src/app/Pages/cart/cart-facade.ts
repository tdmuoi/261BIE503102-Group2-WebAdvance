import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { VoucherResult } from '../../models/account';
import { CatalogBook } from '../../models/book';
import { BookService } from '../../services/book-service';
import { CartItem, CartService } from '../../services/cart-service';
import { USE_MOCK_VOUCHER, mockValidateVoucher } from './pricing';

/** PHẢI trùng STORAGE_KEY trong services/cart-service.ts (file của bạn khác, không sửa) */
const CART_KEY = 'lightbook.cart';
const DESELECTED_KEY = 'lightbook.cart.deselected';
const VOUCHER_KEY = 'lightbook.cart.voucher';

/** Một dòng giỏ hàng đã ghép thông tin sách từ danh mục */
export interface CartLine {
  bookId: string;
  title: string;
  image: string;
  price: number;
  originalPrice: number;
  discountPercent: number;
  quantity: number;
  /** Tối đa được mua: ebook = 1, sách giấy = tồn kho */
  max: number;
  ebook: boolean;
  /** "Sách mới" / "Sách cũ" / "Sách điện tử" */
  variant: string;
  author: string;
  /** "Bìa mềm · NXB Trẻ" */
  meta: string;
  bestseller: boolean;
  selected: boolean;
}

const VARIANT = { new: 'Sách mới', used: 'Sách cũ', ebook: 'Sách điện tử' } as const;

/**
 * Lớp làm việc với giỏ hàng cho các trang Giỏ hàng / Thanh toán / Mua lại.
 *
 * CartService (của bạn khác) mới có hàm add(), nên đổi số lượng / xoá được làm ở đây bằng cách
 * ghi lại localStorage cùng key rồi phát sự kiện "storage" — CartService đã sẵn lắng nghe sự kiện này
 * nên badge giỏ hàng ở header vẫn cập nhật. Khi CartService có setQuantity/remove thì thay bằng hàm đó.
 */
@Injectable({ providedIn: 'root' })
export class CartFacade {
  private readonly cart = inject(CartService);
  private readonly bookService = inject(BookService);
  private readonly http = inject(HttpClient);

  /** null = đang tải danh mục */
  private readonly catalog = toSignal(
    this.bookService.getCatalog().pipe(
      map((c) => new Map(c.books.map((b) => [b._id, b] as const))),
      catchError(() => of(new Map<string, CatalogBook>())),
    ),
    { initialValue: null },
  );

  private readonly deselected = signal<string[]>(readSession<string[]>(DESELECTED_KEY, []));
  readonly voucher = signal<VoucherResult | null>(readSession<VoucherResult | null>(VOUCHER_KEY, null));

  readonly loading = computed(() => this.catalog() === null);

  readonly lines = computed<CartLine[]>(() => {
    const catalog = this.catalog() ?? new Map<string, CatalogBook>();
    const off = new Set(this.deselected());
    return this.cart.items().map((item) => toLine(item, catalog.get(item.bookId), !off.has(item.bookId)));
  });

  readonly selectedLines = computed(() => this.lines().filter((l) => l.selected));
  readonly allSelected = computed(() => this.lines().length > 0 && this.lines().every((l) => l.selected));

  constructor() {
    // Ebook chỉ được mua 1: dữ liệu cũ trong giỏ có ebook số lượng > 1 thì đưa về 1
    effect(() => {
      const fix = this.lines().filter((l) => l.ebook && l.quantity > 1);
      if (fix.length) untracked(() => fix.forEach((l) => this.setQuantity(l.bookId, 1)));
    });
  }

  setQuantity(bookId: string, quantity: number): void {
    const line = this.lines().find((l) => l.bookId === bookId);
    const max = line?.max ?? Number.MAX_SAFE_INTEGER;
    const qty = Math.min(Math.max(1, Math.floor(quantity)), max);
    this.write(this.cart.items().map((i) => (i.bookId === bookId ? { ...i, quantity: qty } : i)));
  }

  remove(bookIds: string[]): void {
    const ids = new Set(bookIds);
    this.write(this.cart.items().filter((i) => !ids.has(i.bookId)));
    this.setDeselected(this.deselected().filter((id) => !ids.has(id)));
  }

  toggle(bookId: string): void {
    const off = this.deselected();
    this.setDeselected(off.includes(bookId) ? off.filter((id) => id !== bookId) : [...off, bookId]);
  }

  toggleAll(): void {
    this.setDeselected(this.allSelected() ? this.lines().map((l) => l.bookId) : []);
  }

  /** Dùng cho "Mua lại": thêm sách vào giỏ (ebook luôn 1 cuốn) và đánh dấu chọn */
  addBook(book: Pick<CatalogBook, '_id' | 'title' | 'image' | 'price'> & { type?: string }, quantity = 1): void {
    const ebook = book.type === 'ebook';
    const items = [...this.cart.items()];
    const index = items.findIndex((i) => i.bookId === book._id);
    if (index >= 0) items[index] = { ...items[index], quantity: ebook ? 1 : items[index].quantity + quantity };
    else items.push({ bookId: book._id, title: book.title, image: book.image, price: book.price, quantity: ebook ? 1 : quantity });
    this.write(items);
    this.setDeselected(this.deselected().filter((id) => id !== book._id));
  }

  validateVoucher(code: string): Observable<VoucherResult> {
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có POST /api/vouchers/validate
    return USE_MOCK_VOUCHER
      ? mockValidateVoucher(code)
      : this.http.post<VoucherResult>(`${environment.apiUrl}/vouchers/validate`, { code: code.trim().toUpperCase() });
  }

  setVoucher(voucher: VoucherResult | null): void {
    this.voucher.set(voucher);
    writeSession(VOUCHER_KEY, voucher);
  }

  /** Sau khi đặt hàng: bỏ các sách đã mua khỏi giỏ và xoá mã giảm giá */
  completeOrder(bookIds: string[]): void {
    this.remove(bookIds);
    this.setVoucher(null);
  }

  private setDeselected(ids: string[]): void {
    this.deselected.set(ids);
    writeSession(DESELECTED_KEY, ids);
  }

  private write(items: CartItem[]): void {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      return;
    }
    // CartService chỉ đọc lại localStorage khi có sự kiện "storage" → tự phát cho tab hiện tại
    window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }));
  }
}

function toLine(item: CartItem, book: CatalogBook | undefined, selected: boolean): CartLine {
  const ebook = book?.type === 'ebook';
  const meta = [book?.coverType, book?.publisher].filter(Boolean).join(' · ');
  return {
    bookId: item.bookId,
    title: book?.title ?? item.title,
    image: book?.image ?? item.image,
    price: book?.price ?? item.price,
    originalPrice: book?.originalPrice ?? item.price,
    discountPercent: book?.discountPercent ?? 0,
    quantity: item.quantity,
    max: ebook ? 1 : book?.stock && book.stock > 0 ? book.stock : 99,
    ebook,
    variant: VARIANT[book?.type ?? 'new'],
    author: book?.authorName ?? '',
    meta: ebook ? ['Sách điện tử', book?.publisher].filter(Boolean).join(' · ') : meta,
    bestseller: (book?.soldCount ?? 0) >= 100,
    selected,
  };
}

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // bỏ qua
  }
}
