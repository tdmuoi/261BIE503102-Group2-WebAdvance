import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, concatMap, from, last, of } from 'rxjs';

import { environment } from '../../environments/environment';
import { Book } from '../models/book';
import { AuthService } from './auth-service';

/** Một cuốn trong danh sách yêu thích. Khi đăng nhập, server trả thêm giá gốc, tác giả, loại sách */
export interface WishlistItem {
  bookId: string;
  title: string;
  image: string;
  price: number;
  addedAt: string | null;
  originalPrice?: number;
  discountPercent?: number;
  author?: string;
  /** new | used | ebook */
  type?: string;
  stock?: number | null;
}

type WishlistBook = Pick<Book, '_id' | 'title' | 'image' | 'price'>;

/** Wishlist của khách chưa đăng nhập (đăng nhập xong sẽ gộp lên tài khoản rồi xoá) */
const GUEST_KEY = 'lightbook.wishlist';

/**
 * Danh sách yêu thích.
 * - Đã đăng nhập: lưu trên server theo tài khoản (GET/POST/DELETE /api/wishlist — my-server/routes/customer-wishlist.js)
 * - Chưa đăng nhập: lưu tạm localStorage; đăng nhập thì gộp lên tài khoản.
 * Giao diện dùng has / toggle / items như cũ, cập nhật ngay rồi mới gọi API (lỗi thì trả lại như trước).
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/wishlist`;

  private readonly state = signal<WishlistItem[]>([]);
  private readonly statusState = signal<'loading' | 'ready' | 'error'>('loading');

  readonly items = this.state.asReadonly();
  readonly count = computed(() => this.state().length);
  /** Trạng thái tải từ server (chưa đăng nhập luôn là "ready") */
  readonly status = this.statusState.asReadonly();

  constructor() {
    // Đổi người dùng (đăng nhập / đăng xuất / hết phiên) → tải lại đúng wishlist của người đó
    effect(() => {
      const userId = this.auth.user()?._id ?? null;
      untracked(() => (userId ? this.loadRemote() : this.loadGuest()));
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === GUEST_KEY && !this.auth.isLoggedIn()) this.loadGuest();
      });
    }
  }

  has(bookId: string): boolean {
    return this.state().some((item) => item.bookId === bookId);
  }

  add(book: WishlistBook): void {
    if (this.has(book._id)) return;
    const before = this.state();
    this.state.set([{ bookId: book._id, title: book.title, image: book.image, price: book.price, addedAt: new Date().toISOString() }, ...before]);
    if (!this.auth.isLoggedIn()) return this.saveGuest();
    this.http.post<WishlistItem[]>(`${this.baseUrl}/${book._id}`, {}, { headers: this.headers() }).subscribe({
      next: (list) => this.state.set(list),
      error: (error: unknown) => this.rollback(before, error),
    });
  }

  remove(bookId: string): void {
    const before = this.state();
    this.state.set(before.filter((item) => item.bookId !== bookId));
    if (!this.auth.isLoggedIn()) return this.saveGuest();
    this.http.delete<WishlistItem[]>(`${this.baseUrl}/${bookId}`, { headers: this.headers() }).subscribe({
      next: (list) => this.state.set(list),
      error: (error: unknown) => this.rollback(before, error),
    });
  }

  /** Thêm nếu chưa có, bỏ nếu đã có. Trả về true nếu sau khi bấm sách nằm trong wishlist */
  toggle(book: WishlistBook): boolean {
    if (this.has(book._id)) {
      this.remove(book._id);
      return false;
    }
    this.add(book);
    return true;
  }

  /** Tải lại từ server (nút "Thử lại" ở trang Wishlist) */
  reload(): void {
    if (this.auth.isLoggedIn()) this.loadRemote();
    else this.loadGuest();
  }

  private loadGuest(): void {
    this.state.set(readGuest());
    this.statusState.set('ready');
  }

  /** Gộp wishlist khách (nếu có) lên tài khoản rồi lấy danh sách của tài khoản */
  private loadRemote(): void {
    this.statusState.set('loading');
    const guest = readGuest();
    const merge$: Observable<unknown> = guest.length
      ? from(guest).pipe(
          concatMap((item) => this.http.post(`${this.baseUrl}/${item.bookId}`, {}, { headers: this.headers() }).pipe(catchError(() => of(null)))),
          last(),
        )
      : of(null);
    merge$.subscribe({
      complete: () => {
        if (guest.length) writeGuest([]);
        this.http.get<WishlistItem[]>(this.baseUrl, { headers: this.headers() }).subscribe({
          next: (list) => {
            this.state.set(list);
            this.statusState.set('ready');
          },
          error: (error: unknown) => {
            this.state.set([]);
            this.statusState.set('error');
            this.expireOn401(error);
          },
        });
      },
    });
  }

  private rollback(before: WishlistItem[], error: unknown): void {
    this.state.set(before);
    this.expireOn401(error);
  }

  private expireOn401(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) this.auth.expire();
  }

  private saveGuest(): void {
    writeGuest(this.state());
  }

  private headers(): HttpHeaders {
    const token = this.auth.token;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}

function readGuest(): WishlistItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
    // Bỏ sách mẫu "mock-..." của bản demo cũ
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.bookId === 'string' && !x.bookId.startsWith('mock-')) : [];
  } catch {
    return [];
  }
}

function writeGuest(items: WishlistItem[]): void {
  try {
    if (items.length) localStorage.setItem(GUEST_KEY, JSON.stringify(items));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // Trình duyệt chặn localStorage thì chỉ giữ trong phiên này
  }
}
