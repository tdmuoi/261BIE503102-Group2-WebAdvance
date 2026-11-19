import { Component, computed, input, output } from '@angular/core';

import { LbEvent } from '../../../../models/content';
import { AuthorProfile } from '../../../../services/author-directory-service';
import { longDate, placeLabel } from '../../../../shared/event-utils';

@Component({
  selector: 'app-author-featured',
  standalone: false,
  styleUrl: './author-featured.css',
  templateUrl: './author-featured.html',
})
export class AuthorFeatured {
  readonly author = input.required<AuthorProfile>();
  readonly event = input<LbEvent | null>(null);

  readonly following = input(false);
  readonly followed = output<void>();

  protected readonly cover = computed(() => this.author().books.find((book) => book.image) ?? null);
  protected readonly eventDate = computed(() => (this.event() ? longDate(this.event()!) : ''));
  protected readonly eventPlace = computed(() => (this.event() ? placeLabel(this.event()!) : ''));
}
