import { Component, input, signal } from '@angular/core';

const TINTS = ['pink', 'mint', 'yellow', 'pink-strong'];

@Component({
  selector: 'app-author-avatar',
  standalone: false,
  styleUrl: './author-avatar.css',
  templateUrl: './author-avatar.html',
  host: { '[attr.data-tint]': 'tint()' },
})
export class AuthorAvatar {
  readonly name = input.required<string>();
  readonly initials = input.required<string>();
  readonly photo = input<string | null>(null);
  readonly index = input(0);

  protected readonly failed = signal(false);

  protected tint(): string {
    return TINTS[Math.abs(this.index()) % TINTS.length];
  }
}
