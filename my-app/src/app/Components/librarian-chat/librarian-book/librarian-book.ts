import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartService } from '../../../services/cart-service';
import { LibrarianPick } from '../../../services/librarian-service';
import { ToastService } from '../../../services/toast-service';
import { SharedModule } from '../../../shared/shared-module';

@Component({
  selector: 'app-librarian-book',
  imports: [RouterLink, SharedModule],
  styleUrl: './librarian-book.css',
  templateUrl: './librarian-book.html',
})
export class LibrarianBook {
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);

  readonly book = input.required<LibrarianPick>();
  readonly index = input.required<number>();
  readonly opened = output<void>();

  protected addToCart(): void {
    const book = this.book();
    this.cart.add(book, 1);
    this.toast.show(`Đã thêm “${book.title}” vào giỏ.`, { label: 'Xem giỏ hàng', path: '/cart' });
  }
}
