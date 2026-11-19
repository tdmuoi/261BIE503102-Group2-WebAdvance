import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-art',
  standalone: false,
  styleUrl: './auth-art.css',
  templateUrl: './auth-art.html',
  host: {
    'aria-hidden': 'true',
    '[class.is-pink]': "tone() === 'pink'",
    '[class.is-mint]': "tone() === 'mint'",
  },
})
export class AuthArt {
  readonly tone = input<'yellow' | 'pink' | 'mint'>('yellow');
}
