import { Component, input } from '@angular/core';

@Component({
  selector: 'app-sticker',
  standalone: false,
  template: '{{ label() }}',
  styleUrl: './sticker.css',
  host: { '[attr.data-tone]': 'tone()', '[class.is-right]': 'tilt() === "right"', 'aria-hidden': 'true' },
})
export class Sticker {
  readonly label = input.required<string>();
  readonly tone = input<'pink' | 'mint' | 'yellow'>('mint');
  readonly tilt = input<'left' | 'right'>('left');
}
