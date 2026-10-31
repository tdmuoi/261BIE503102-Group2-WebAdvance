import { Component, input } from '@angular/core';

/** Sticker trang trí nghiêng ±8° — Figma "Sticker" (860:139). Trang đặt vị trí (absolute) qua class */
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
