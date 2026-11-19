import { Component, computed, input, output, signal } from '@angular/core';

import { Catalog, CatalogBook } from '../../../../models/book';
import { LbEvent } from '../../../../models/content';
import { toInitials } from '../../../../services/author-directory-service';
import { dateBlock, downloadIcs, eventState, placeLabel, seatsLeft, timeRange } from '../../../../shared/event-utils';

@Component({
  selector: 'app-event-featured',
  standalone: false,
  styleUrl: './event-featured.css',
  templateUrl: './event-featured.html',
})
export class EventFeatured {
  readonly event = input.required<LbEvent>();
  readonly catalog = input<Catalog | null>(null);

  readonly reserve = output<LbEvent>();
  protected readonly failedImage = signal('');

  protected readonly state = computed(() => eventState(this.event()));
  protected readonly date = computed(() => dateBlock(this.event().startAt));
  protected readonly time = computed(() => timeRange(this.event()));
  protected readonly place = computed(() => placeLabel(this.event()));
  protected readonly seats = computed(() => seatsLeft(this.event()));

  private readonly author = computed(() => {
    const id = this.event().authorId;
    return id ? (this.catalog()?.authors.find((a) => a._id === id) ?? null) : null;
  });

  protected readonly hosts = computed(() => {
    const guests = this.event().guests?.filter(Boolean) ?? [];
    return guests.length ? guests : this.author() ? [this.author()!.name] : [];
  });
  protected readonly hostInitials = computed(() => (this.hosts()[0] ? toInitials(this.hosts()[0]) : ''));

  protected readonly cover = computed<CatalogBook | null>(() => {
    const books = this.catalog()?.books ?? [];
    const ids = this.event().bookIds ?? [];
    const linked = ids.map((id) => books.find((b) => b._id === id)).find((b) => b?.image);
    if (linked) return linked;
    const authorId = this.event().authorId;
    return (authorId && books.find((b) => b.authorId === authorId && b.image)) || null;
  });

  protected addToCalendar(): void {
    downloadIcs(this.event());
  }
}
