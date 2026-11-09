import { Injectable, signal } from '@angular/core';

/** Combo giảm thêm 10% trên tổng giá bán của các cuốn */
export const COMBO_EXTRA_DISCOUNT = 0.1;

/** Giá combo: tổng giá bán giảm 10%, làm tròn tới nghìn (trang chủ và giỏ hàng dùng chung) */
export function comboPrice(salePrice: number): number {
  return Math.round((salePrice * (1 - COMBO_EXTRA_DISCOUNT)) / 1000) * 1000;
}

/** Một combo khách đã thêm vào giỏ */
export interface CartCombo {
  id: string;
  name: string;
  bookIds: string[];
  /** Combo tự chọn: freeship giao tiêu chuẩn */
  freeship: boolean;
}

/** Dòng giỏ tối thiểu để tính giảm combo */
export interface ComboLine {
  bookId: string;
  price: number;
  quantity: number;
}

export interface ComboDiscount {
  /** Tổng tiền giảm của các combo đủ sách */
  amount: number;
  freeship: boolean;
  /** bookId → tên combo (để gắn nhãn trên dòng giỏ hàng) */
  labels: Map<string, string>;
}

const STORAGE_KEY = 'lightbook.cart.combos';

/**
 * Các combo trong giỏ, lưu localStorage cạnh giỏ hàng (CartService chỉ lưu từng cuốn).
 * Combo chỉ được giảm khi đủ mọi cuốn của nó đang được chọn trong giỏ; mỗi cuốn tính 1 bản.
 * Mỗi cuốn thuộc tối đa 1 combo: thêm combo mới trùng sách thì combo cũ bị thay.
 */
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

  /** Bỏ các combo có chứa sách vừa xoá khỏi giỏ (sách còn lại về giá lẻ) */
  removeBooks(bookIds: string[]): void {
    const ids = new Set(bookIds);
    const kept = this.state().filter((c) => !c.bookIds.some((id) => ids.has(id)));
    if (kept.length !== this.state().length) this.set(kept);
  }

  /** Giảm giá combo cho các dòng đang chọn */
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
      // Trình duyệt chặn localStorage thì combo chỉ sống trong phiên này
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
