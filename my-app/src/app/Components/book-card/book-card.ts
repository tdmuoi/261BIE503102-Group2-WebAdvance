import { Component, computed, inject, input } from '@angular/core';

import { BookView } from '../../models/book';
import { WishlistService } from '../../services/wishlist-service';

@Component({
  selector: 'app-book-card',
  standalone: false,
  styleUrl: './book-card.css',
  templateUrl: './book-card.html',
})
export class BookCard {
  readonly book = input.required<BookView>();

  private readonly wishlist = inject(WishlistService);

  protected readonly liked = computed(() => this.wishlist.has(this.book()._id));

  protected toggleLike(): void {
    const b = this.book();
    this.wishlist.toggle({ _id: b._id, title: b.title, image: b.image, price: b.price });
  }
}
