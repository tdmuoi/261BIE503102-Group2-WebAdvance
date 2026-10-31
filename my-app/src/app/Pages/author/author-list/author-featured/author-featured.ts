import { Component, computed, input, output } from '@angular/core';

import { LbEvent } from '../../../../models/content';
import { AuthorProfile } from '../../../../services/author-directory-service';
import { longDate, placeLabel } from '../../../../shared/event-utils';

/** Thẻ vàng "Tác giả của tháng" cạnh thẻ hồng "Sắp diễn ra" — Figma 876:6263 */
@Component({
  selector: 'app-author-featured',
  standalone: false,
  styleUrl: './author-featured.css',
  templateUrl: './author-featured.html',
})
export class AuthorFeatured {
  readonly author = input.required<AuthorProfile>();
  /** Sự kiện sắp diễn ra gần nhất — null thì ẩn thẻ hồng */
  readonly event = input<LbEvent | null>(null);

  readonly followed = output<void>();

  /** Bìa sách thật của tác giả (cuốn mới nhất có ảnh) */
  protected readonly cover = computed(() => this.author().books.find((book) => book.image) ?? null);
  protected readonly eventDate = computed(() => (this.event() ? longDate(this.event()!) : ''));
  protected readonly eventPlace = computed(() => (this.event() ? placeLabel(this.event()!) : ''));
}
