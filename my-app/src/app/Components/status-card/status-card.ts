import { Component, input } from '@angular/core';

@Component({
  selector: 'app-status-card',
  standalone: false,
  styleUrl: './status-card.css',
  templateUrl: './status-card.html',
})
export class StatusCard {
  readonly tone = input<'loading' | 'error' | 'info'>('info');
  readonly title = input('');
  readonly message = input('');
}
