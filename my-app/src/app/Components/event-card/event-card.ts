import { Component, computed, input, output, signal } from '@angular/core';

import { LbEvent } from '../../models/content';
import { dateBlock, eventState, placeLabel, seatsLeft, timeRange } from '../../shared/event-utils';

@Component({
  selector: 'app-event-card',
  standalone: false,
  styleUrl: './event-card.css',
  templateUrl: './event-card.html',
  host: { '[class]': '"is-" + state()' },
})
export class EventCard {
  readonly event = input.required<LbEvent>();

  readonly reserve = output<LbEvent>();
  protected readonly failedImage = signal('');

  protected readonly state = computed(() => eventState(this.event()));
  protected readonly date = computed(() => dateBlock(this.event().startAt));
  protected readonly time = computed(() => timeRange(this.event()));
  protected readonly place = computed(() => placeLabel(this.event()));
  protected readonly seats = computed(() => seatsLeft(this.event()));
}
