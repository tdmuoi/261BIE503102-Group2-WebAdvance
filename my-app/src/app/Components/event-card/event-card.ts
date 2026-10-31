import { Component, computed, input, output } from '@angular/core';

import { LbEvent } from '../../models/content';
import { dateBlock, eventState, placeLabel, seatsLeft, timeRange } from '../../shared/event-utils';

/**
 * Thẻ sự kiện giao lưu — Figma "Event card" (874:484).
 * Upcoming: số chỗ còn lại + nút giữ chỗ; Full: hết chỗ; Past: đã diễn ra, xem lại (nếu có bản ghi).
 */
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

  protected readonly state = computed(() => eventState(this.event()));
  protected readonly date = computed(() => dateBlock(this.event().startAt));
  protected readonly time = computed(() => timeRange(this.event()));
  protected readonly place = computed(() => placeLabel(this.event()));
  protected readonly seats = computed(() => seatsLeft(this.event()));
}
