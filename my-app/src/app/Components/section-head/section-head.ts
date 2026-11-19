import { Component, input } from '@angular/core';

@Component({
  selector: 'app-section-head',
  standalone: false,
  styleUrl: './section-head.css',
  templateUrl: './section-head.html',
  host: { '[class.is-center]': 'center()' },
})
export class SectionHead {
  readonly tag = input('');
  readonly title = input.required<string>();
  readonly accent = input('');
  readonly subtitle = input('');
  readonly linkText = input('');
  readonly link = input<string | unknown[] | null>(null);
  readonly center = input(false);
}
