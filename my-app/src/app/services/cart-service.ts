import { Injectable, computed, signal } from '@angular/core';

import { Book } from '../models/book';

/** Một dòng trong giỏ — lưu kèm tên, ảnh, giá lúc thêm để trang Giỏ hàng hiện ngay không cần gọi API */
export interface CartItem {
  bookId: string;
  title: string;
  image: string;
  price: number;
  quantity: number;
}

const STORAGE_KEY = 'lightbook.cart';

/**
 * Giỏ hàng tối giản, lưu localStorage (chưa có API giỏ hàng).
 * Mở nhiều tab thì đồng bộ qua sự kiện "storage".
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly state = signal<CartItem[]>(readStorage());

  readonly items = this.state.asReadonly();

  /** Tổng số cuốn — hiện trên badge icon giỏ ở header */
  readonly count = computed(() => this.state().reduce((sum, item) => sum + item.quantity, 0));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) this.state.set(readStorage());
      });
    }
  }

  quantityOf(bookId: string): number {
    return this.state().find((item) => item.bookId === bookId)?.quantity ?? 0;
  }

  /** Thêm sách, đã có thì cộng dồn số lượng */
  add(book: Book, quantity: number): void {
    if (quantity <= 0) return;
    const items = [...this.state()];
    const index = items.findIndex((item) => item.bookId === book._id);
    if (index >= 0) {
      items[index] = { ...items[index], quantity: items[index].quantity + quantity };
    } else {
      items.push({ bookId: book._id, title: book.title, image: book.image, price: book.price, quantity });
    }
    this.state.set(items);
    writeStorage(items);
  }
}

function readStorage(): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: CartItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Trình duyệt chặn localStorage (ẩn danh...) thì giỏ chỉ sống trong phiên này
  }
}

function isCartItem(value: unknown): value is CartItem {
  const item = value as CartItem;
  return !!item && typeof item.bookId === 'string' && typeof item.quantity === 'number' && item.quantity > 0;
}
