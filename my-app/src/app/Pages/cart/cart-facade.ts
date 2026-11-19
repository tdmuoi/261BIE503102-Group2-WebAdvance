import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, catchError, filter, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { VoucherResult } from '../../models/account';
import { CatalogBook } from '../../models/book';
import { AccountService } from '../../services/account-service';
import { BookService } from '../../services/book-service';
import { CartItem, CartService } from '../../services/cart-service';
import { ComboService } from '../../services/combo-service';
import { ComboTotals } from './pricing';

const DESELECTED_KEY = 'lightbook.cart.deselected';
const VOUCHER_KEY = 'lightbook.cart.voucher';

export interface CartLine {
  bookId: string;
  title: string;
  image: string;
  price: number;
  originalPrice: number;
  discountPercent: number;
  quantity: number;
  max: number;
  ebook: boolean;
  variant: string;
  author: string;
  meta: string;
  bestseller: boolean;
  selected: boolean;
}

const VARIANT = { new: 'Sách mới', used: 'Sách cũ', ebook: 'Sách điện tử' } as const;

@Injectable({ providedIn: 'root' })
export class CartFacade {
  private readonly cart = inject(CartService);
  private readonly bookService = inject(BookService);
  private readonly router = inject(Router);
  private readonly account = inject(AccountService);
  private readonly comboService = inject(ComboService);
  readonly publicSettings = this.account.publicSettings;
  readonly settingsError = this.account.settingsError;
  readonly freeshipText = this.account.freeshipText;
  readonly catalogError = signal(false);

  private readonly catalog = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd && /^\/(cart|checkout)(?:[?#]|$)/.test(event.urlAfterRedirects)),
      startWith(null),
      switchMap(() => {
        this.catalogError.set(false);
        return forkJoin({ catalog: this.bookService.getCatalog(), settings: this.account.getPublicSettings(true) }).pipe(
          map(({ catalog }) => new Map(catalog.books.map((b) => [b._id, b] as const))),
          catchError(() => { this.catalogError.set(true); return of(new Map<string, CatalogBook>()); }),
          startWith(null),
        );
      }),
    ),
    { initialValue: null },
  );

  private readonly deselected = signal<string[]>(readSession<string[]>(DESELECTED_KEY, []));
  readonly voucher = signal<VoucherResult | null>(validVoucher(readSession<VoucherResult | null>(VOUCHER_KEY, null)));

  readonly loading = computed(() => this.catalog() === null);

  readonly lines = computed<CartLine[]>(() => {
    const catalog = this.catalog() ?? new Map<string, CatalogBook>();
    const off = new Set(this.deselected());
    return this.cart.items().map((item) => toLine(item, catalog.get(item.bookId), !off.has(item.bookId)));
  });

  readonly selectedLines = computed(() => this.lines().filter((l) => l.selected));
  readonly stockError = computed(() => this.selectedLines().some(line => line.max < line.quantity));
  readonly allSelected = computed(() => this.lines().length > 0 && this.lines().every((l) => l.selected));

  private readonly comboDiscount = computed(() => this.publicSettings()?.promotions?.combosEnabled === true
    ? this.comboService.discountFor(this.selectedLines()) : { amount: 0, freeship: false, labels: new Map<string, string>() });
  readonly comboTotals = computed<ComboTotals>(() => ({ amount: this.comboDiscount().amount, freeship: this.comboDiscount().freeship }));
  readonly comboLabels = computed(() => this.comboDiscount().labels);

  constructor() {
    effect(() => {
      const fix = this.lines().filter((l) => l.ebook && l.quantity > 1);
      if (fix.length) untracked(() => fix.forEach((l) => this.setQuantity(l.bookId, 1)));
    });
  }

  setQuantity(bookId: string, quantity: number): void {
    const line = this.lines().find((l) => l.bookId === bookId);
    const max = line?.max ?? Number.MAX_SAFE_INTEGER;
    const qty = Math.min(Math.max(1, Math.floor(quantity)), Math.max(1, max));
    this.write(this.cart.items().map((i) => (i.bookId === bookId ? { ...i, quantity: qty } : i)));
  }

  remove(bookIds: string[]): void {
    const ids = new Set(bookIds);
    this.write(this.cart.items().filter((i) => !ids.has(i.bookId)));
    this.setDeselected(this.deselected().filter((id) => !ids.has(id)));
    this.comboService.removeBooks(bookIds);
  }

  toggle(bookId: string): void {
    const off = this.deselected();
    this.setDeselected(off.includes(bookId) ? off.filter((id) => id !== bookId) : [...off, bookId]);
  }

  toggleAll(): void {
    this.setDeselected(this.allSelected() ? this.lines().map((l) => l.bookId) : []);
  }

  addBook(book: Pick<CatalogBook, '_id' | 'title' | 'image' | 'price'> & { type?: string }, quantity = 1): void {
    const ebook = book.type === 'ebook';
    const items = [...this.cart.items()];
    const index = items.findIndex((i) => i.bookId === book._id);
    if (index >= 0) items[index] = { ...items[index], quantity: ebook ? 1 : items[index].quantity + quantity };
    else items.push({ bookId: book._id, title: book.title, image: book.image, price: book.price, quantity: ebook ? 1 : quantity });
    this.write(items);
    this.setDeselected(this.deselected().filter((id) => id !== book._id));
  }

  addCombo(name: string, books: Pick<CatalogBook, '_id' | 'title' | 'image' | 'price'>[], freeship = false): void {
    const items = [...this.cart.items()];
    for (const book of books) {
      if (!items.some((i) => i.bookId === book._id)) {
        items.push({ bookId: book._id, title: book.title, image: book.image, price: book.price, quantity: 1 });
      }
    }
    this.write(items);
    const ids = new Set(books.map((b) => b._id));
    this.setDeselected(this.deselected().filter((id) => !ids.has(id)));
    this.comboService.add({ name, bookIds: books.map((b) => b._id), freeship });
  }

  validateVoucher(code: string): Observable<VoucherResult> {
    return this.account.applyVoucher({
      code: code.trim().toUpperCase(),
      items: this.selectedLines().map((l) => ({ bookId: l.bookId, quantity: l.quantity })),
      combos: this.combosForOrder(),
    });
  }

  combosForOrder(): { bookIds: string[]; freeship: boolean }[] {
    if (this.publicSettings()?.promotions?.combosEnabled !== true) return [];
    return this.comboService.combos().map((c) => ({ bookIds: c.bookIds, freeship: c.freeship }));
  }

  setVoucher(voucher: VoucherResult | null): void {
    this.voucher.set(voucher);
    writeSession(VOUCHER_KEY, voucher);
  }

  completeOrder(bookIds: string[]): void {
    this.remove(bookIds);
    this.setVoucher(null);
  }

  private setDeselected(ids: string[]): void {
    this.deselected.set(ids);
    writeSession(DESELECTED_KEY, ids);
  }

  private write(items: CartItem[]): void {
    this.cart.replace(items);
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
    max: ebook ? (book?.ebookReady === false ? 0 : 1) : Number.isSafeInteger(book?.stock) ? Math.max(0, book!.stock) : 0,
    ebook,
    variant: VARIANT[book?.type ?? 'new'],
    author: book?.authorName ?? '',
    meta: ebook ? ['Sách điện tử', book?.publisher].filter(Boolean).join(' · ') : meta,
    bestseller: (book?.soldCount ?? 0) >= 100,
    selected,
  };
}

function validVoucher(v: VoucherResult | null): VoucherResult | null {
  return v && typeof v.code === 'string' && ['percent', 'fixed', 'freeship'].includes(v.type) ? v : null;
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
  }
}
