import { Injectable, computed, signal } from '@angular/core';

import { Book } from '../models/book';

/** Một cuốn trong danh sách yêu thích — lưu kèm tên, ảnh, giá lúc thêm để hiện ngay */
export interface WishlistItem {
  bookId: string;
  title: string;
  image: string;
  price: number;
  addedAt: string;
}

const STORAGE_KEY = 'lightbook.wishlist';

/**
 * Danh sách yêu thích, lưu localStorage (chưa có API — xem TODO trong Pages/account/wishlist).
 * Cách làm giống CartService: signal + đồng bộ nhiều tab qua sự kiện "storage".
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly state = signal<WishlistItem[]>(readStorage());

  readonly items = this.state.asReadonly();
  readonly count = computed(() => this.state().length);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) this.state.set(readStorage());
      });
    }
  }

  has(bookId: string): boolean {
    return this.state().some((item) => item.bookId === bookId);
  }

  add(book: Pick<Book, '_id' | 'title' | 'image' | 'price'>): void {
    if (this.has(book._id)) return;
    this.save([{ bookId: book._id, title: book.title, image: book.image, price: book.price, addedAt: new Date().toISOString() }, ...this.state()]);
  }

  remove(bookId: string): void {
    this.save(this.state().filter((item) => item.bookId !== bookId));
  }

  /** Thêm nếu chưa có, bỏ nếu đã có. Trả về true nếu sau khi bấm sách nằm trong wishlist */
  toggle(book: Pick<Book, '_id' | 'title' | 'image' | 'price'>): boolean {
    if (this.has(book._id)) {
      this.remove(book._id);
      return false;
    }
    this.add(book);
    return true;
  }

  private save(items: WishlistItem[]): void {
    this.state.set(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Trình duyệt chặn localStorage thì chỉ giữ trong phiên này
    }
  }
}

function readStorage(): WishlistItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.bookId === 'string') : [];
  } catch {
    return [];
  }
}
