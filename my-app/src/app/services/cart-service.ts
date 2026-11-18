import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth-service';

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
 * Khách: localStorage. Đăng nhập: MongoDB theo tài khoản, có cache riêng.
 * Mở nhiều tab thì đồng bộ qua sự kiện "storage".
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly url = `${environment.apiUrl}/cart`;
  private readonly state = signal<CartItem[]>(readStorage());
  private readonly syncState = signal<'ready' | 'loading' | 'saving' | 'error'>('ready');
  private readonly errorState = signal('');
  readonly syncStatus = this.syncState.asReadonly();
  readonly syncError = this.errorState.asReadonly();
  private owner: string | null = null;
  private revision: number | null = null;
  private generation = 0;
  private edits = 0;
  private pending = false;
  private loading = false;
  private saving = false;
  private request?: Subscription;

  readonly items = this.state.asReadonly();

  /** Tổng số cuốn — hiện trên badge icon giỏ ở header */
  readonly count = computed(() => this.state().reduce((sum, item) => sum + item.quantity, 0));

  constructor() {
    effect(() => {
      const owner = this.auth.user()?._id ?? null;
      untracked(() => this.switchOwner(owner));
    });
    const onStorage = (event: StorageEvent) => {
      if (!this.owner && event.key === STORAGE_KEY) this.state.set(readStorage());
      // Refresh another tab only after a successful save removes its pending
      // marker. Reading on every local cache edit could restore an older server cart.
      if (this.owner && event.key === `${this.storageKey()}.pending` && event.newValue === null &&
          !this.pending && !this.saving && !this.loading) this.refresh();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }
    this.destroyRef.onDestroy(() => {
      this.request?.unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    });
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
    this.replace(items);
  }

  /** Điểm ghi chung cho thêm/xóa/đổi số lượng và dọn giỏ sau checkout. */
  replace(items: CartItem[]): void {
    this.state.set(items);
    this.edits++;
    if (this.owner) this.pending = true;
    this.saveLocal();
    if (this.owner) this.flush();
  }

  private refresh(): void {
    if (this.pending || this.saving) return;
    this.switchOwner(this.owner, true);
  }

  private storageKey(): string { return this.owner ? `${STORAGE_KEY}.user:${this.owner}` : STORAGE_KEY; }

  private headers(): HttpHeaders { return new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }); }

  private saveLocal(): void {
    writeStorage(this.state(), this.storageKey());
    if (!this.owner) return;
    try {
      const key = `${this.storageKey()}.pending`;
      if (this.pending || this.saving || this.loading && this.edits) localStorage.setItem(key, JSON.stringify({ revision: this.revision }));
      else localStorage.removeItem(key);
    } catch { /* Chặn storage không làm hỏng giỏ trong phiên hiện tại. */ }
  }

  private switchOwner(owner: string | null, force = false): void {
    if (!force && owner === this.owner) return;
    this.request?.unsubscribe();
    const generation = ++this.generation;
    this.owner = owner;
    this.pending = this.saving = this.loading = false;
    this.revision = null;
    this.edits = 0;
    this.errorState.set('');
    const beforeLoad = readStorage(this.storageKey());
    this.state.set(beforeLoad);
    if (!owner) { this.syncState.set('ready'); return; }
    let unsaved: { revision: number | null } | null = null;
    try {
      const key = `${this.storageKey()}.pending`;
      unsaved = force ? null : JSON.parse(localStorage.getItem(key) || 'null');
      if (force) localStorage.removeItem(key);
    } catch { /* Bỏ qua cache hỏng. */ }
    // Only the guest basket is merged on login. Another account's cache is never merged.
    const guest = force ? [] : readStorage();
    this.loading = true;
    this.syncState.set('loading');
    this.request = this.http.get<CartResponse>(this.url, { headers: this.headers() }).subscribe({
      next: response => {
        if (generation !== this.generation) return;
        this.loading = false;
        this.revision = response.revision;
        if (unsaved && unsaved.revision !== response.revision) {
          // Keep unsent local edits after a refresh. Never silently overwrite a
          // newer server revision, even if the previous save timed out.
          this.pending = this.loading = true;
          this.syncState.set('error');
          this.errorState.set('Giỏ tài khoản đã thay đổi. Bản chưa đồng bộ vẫn được giữ trên thiết bị; tải lại để dùng giỏ trên tài khoản.');
          return;
        }
        let items = response.items;
        for (const item of guest) {
          const found = items.find(i => i.bookId === item.bookId);
          items = found ? items.map(i => i.bookId === item.bookId ? { ...i, quantity: Math.max(i.quantity, item.quantity) } : i) : [...items, item];
        }
        // Preserve remote-only books when someone adds/removes items during GET.
        if (this.edits || unsaved) {
          const current = this.state();
          const removed = new Set(beforeLoad.filter(i => !current.some(c => c.bookId === i.bookId)).map(i => i.bookId));
          if (unsaved) for (const item of items) if (!current.some(i => i.bookId === item.bookId)) removed.add(item.bookId);
          items = items.filter(i => !removed.has(i.bookId));
          for (const item of current) items = [...items.filter(i => i.bookId !== item.bookId), item];
        }
        this.state.set(items);
        this.pending = this.pending || guest.length > 0 || !!unsaved;
        if (guest.length) writeStorage([]);
        this.saveLocal();
        this.syncState.set('ready');
        this.flush();
      },
      error: error => { if (generation === this.generation) this.failed(error); },
    });
  }

  private flush(): void {
    if (!this.owner || !this.pending || this.loading || this.saving) return;
    const generation = this.generation, edits = this.edits;
    this.pending = false;
    this.saving = true;
    this.syncState.set('saving');
    this.errorState.set('');
    this.request = this.http.put<CartResponse>(this.url, {
      revision: this.revision, items: this.state().map(({ bookId, quantity }) => ({ bookId, quantity })),
    }, { headers: this.headers() }).subscribe({
      next: response => {
        if (generation !== this.generation) return;
        this.saving = false;
        this.revision = response.revision;
        if (edits === this.edits) this.state.set(response.items);
        this.saveLocal();
        this.syncState.set('ready');
        this.flush();
      },
      error: error => {
        if (generation !== this.generation) return;
        this.pending = true;
        this.failed(error);
      },
    });
  }

  private failed(error: unknown): void {
    // A failed initial read must never turn into an overwrite of the remote cart.
    this.saving = false;
    this.syncState.set('error');
    this.errorState.set(error instanceof HttpErrorResponse && error.status === 409
      ? error.error?.message || 'Giỏ hàng đã thay đổi. Vui lòng tải lại giỏ tài khoản.'
      : 'Chưa đồng bộ được giỏ hàng. Các thay đổi vẫn được giữ trên thiết bị này.');
    if (error instanceof HttpErrorResponse && error.status === 401) this.auth.expire();
  }
}

interface CartResponse { revision: number | null; items: CartItem[]; }

function readStorage(key = STORAGE_KEY): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: CartItem[], key = STORAGE_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Trình duyệt chặn localStorage (ẩn danh...) thì giỏ chỉ sống trong phiên này
  }
}

function isCartItem(value: unknown): value is CartItem {
  const item = value as CartItem;
  return !!item && typeof item.bookId === 'string' && typeof item.quantity === 'number' && item.quantity > 0;
}
