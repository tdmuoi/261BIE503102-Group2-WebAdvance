import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { environment } from '../../environments/environment';
import { Book } from '../models/book';
import { AuthService } from './auth-service';

export interface WishlistItem {
  bookId: string;
  title: string;
  image: string;
  price: number;
  addedAt: string | null;
  originalPrice?: number;
  discountPercent?: number;
  author?: string;
  type?: string;
  stock?: number | null;
}

type WishlistBook = Pick<Book, '_id' | 'title' | 'image' | 'price'>;

const GUEST_KEY = 'lightbook.wishlist';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/wishlist`;

  private readonly state = signal<WishlistItem[]>([]);
  private readonly statusState = signal<'loading' | 'ready' | 'error'>('loading');

  readonly items = this.state.asReadonly();
  readonly count = computed(() => this.state().length);
  readonly status = this.statusState.asReadonly();

  constructor() {
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

  toggle(book: WishlistBook): boolean {
    if (this.has(book._id)) {
      this.remove(book._id);
      return false;
    }
    this.add(book);
    return true;
  }

  reload(): void {
    if (this.auth.isLoggedIn()) this.loadRemote();
    else this.loadGuest();
  }

  private loadGuest(): void {
    this.state.set(readGuest());
    this.statusState.set('ready');
  }

  private loadRemote(): void {
    this.statusState.set('loading');
    this.state.set([]);
    writeGuest([]);
    this.http.get<WishlistItem[]>(this.baseUrl, { headers: this.headers() }).subscribe({
      next: (list) => {
        if (!this.auth.isLoggedIn()) return;
        this.state.set(list);
        this.statusState.set('ready');
      },
      error: (error: unknown) => {
        this.state.set([]);
        this.statusState.set('error');
        this.expireOn401(error);
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
  }
}
