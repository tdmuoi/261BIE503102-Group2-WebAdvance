import { Component, OnDestroy, OnInit, computed, inject, input, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';
import { CartFacade, CartLine } from '../../../cart/cart-facade';
import { computeTotals } from '../../../cart/pricing';

export type BuyAgainTarget = Pick<CatalogBook, '_id' | 'title' | 'image' | 'price'> & { type?: string };

@Component({
  selector: 'app-buy-again-drawer',
  standalone: false,
  styleUrl: './buy-again-drawer.css',
  templateUrl: './buy-again-drawer.html',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class BuyAgainDrawer implements OnInit, OnDestroy {
  private readonly facade = inject(CartFacade);

  readonly book = input.required<BuyAgainTarget>();
  readonly closed = output<void>();

  readonly lines = this.facade.lines;
  readonly totals = computed(() => computeTotals(this.lines().map((l) => ({ price: l.price, quantity: l.quantity, ebook: l.ebook })), null));

  ngOnInit(): void {
    this.facade.addBook(this.book());
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  setQuantity(line: CartLine, quantity: number): void {
    this.facade.setQuantity(line.bookId, quantity);
  }

  metaOf(line: CartLine): string {
    const cover = line.ebook ? '' : line.meta.split(' · ')[0];
    return [line.variant, cover].filter(Boolean).join(' · ');
  }
}
