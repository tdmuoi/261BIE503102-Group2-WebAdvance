import { Component, input } from '@angular/core';

/**
 * Tiêu đề section chuẩn — Figma "Section header" (866:310):
 * Tag pill → H1 Bricolage + accent Instrument Serif nghiêng → subtitle stone-600, link phải (tuỳ chọn).
 * accent dùng font serif chỉ có chữ Latin không dấu — chỉ truyền tiếng Anh.
 */
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
