import { Injectable, signal } from '@angular/core';

export const COMBO_EXTRA_DISCOUNT = 0.1;

export function comboPrice(salePrice: number): number {
  return Math.round((salePrice * (1 - COMBO_EXTRA_DISCOUNT)) / 1000) * 1000;
}

export interface CartCombo {
  id: string;
  name: string;
  bookIds: string[];
  freeship: boolean;
}

export interface ComboLine {
  bookId: string;
  price: number;
  quantity: number;
}

export interface ComboDiscount {
  amount: number;
  freeship: boolean;
  labels: Map<string, string>;
}

const STORAGE_KEY = 'lightbook.cart.combos';

@Injectable({ providedIn: 'root' })
export class ComboService {
  private readonly state = signal<CartCombo[]>(readStorage());

  readonly combos = this.state.asReadonly();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) this.state.set(readStorage());
      });
    }
  }

  add(combo: Omit<CartCombo, 'id'>): void {
    const ids = new Set(combo.bookIds);
    const kept = this.state().filter((c) => !c.bookIds.some((id) => ids.has(id)));
    this.set([...kept, { ...combo, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
  }

  removeBooks(bookIds: string[]): void {
    const ids = new Set(bookIds);
    const kept = this.state().filter((c) => !c.bookIds.some((id) => ids.has(id)));
    if (kept.length !== this.state().length) this.set(kept);
  }

  discountFor(lines: ComboLine[]): ComboDiscount {
    const byId = new Map(lines.filter((l) => l.quantity > 0).map((l) => [l.bookId, l]));
    const result: ComboDiscount = { amount: 0, freeship: false, labels: new Map() };
    for (const combo of this.state()) {
      const books = combo.bookIds.map((id) => byId.get(id));
      if (books.some((b) => !b)) continue;
      const sale = books.reduce((sum, b) => sum + b!.price, 0);
      result.amount += Math.max(0, sale - comboPrice(sale));
      result.freeship ||= combo.freeship;
      combo.bookIds.forEach((id) => result.labels.set(id, combo.name));
    }
    return result;
  }

  private set(combos: CartCombo[]): void {
    this.state.set(combos);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(combos));
    } catch {
    }
  }
}

function readStorage(): CartCombo[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((c): c is CartCombo => !!c && typeof c.id === 'string' && Array.isArray(c.bookIds) && c.bookIds.length > 0)
      : [];
  } catch {
    return [];
  }
}
