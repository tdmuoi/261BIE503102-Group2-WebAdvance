import { Component, Input } from '@angular/core';

export type StatTone = 'default' | 'ok' | 'warn' | 'bad' | 'info';

@Component({
  selector: 'app-stat-card',
  standalone: false,
  styleUrl: './stat-card.css',
  templateUrl: './stat-card.html',
})
export class StatCard {
  @Input() label = '';
  @Input() value: number | string | null | undefined = null;
  @Input() unit = '';
  @Input() note = '';
  @Input() tone: StatTone = 'default';
  @Input() link: string | null = null;

  get displayValue(): string {
    if (this.value === null || this.value === undefined || this.value === '') return '—';
    return typeof this.value === 'number' ? this.value.toLocaleString('vi-VN') : this.value;
  }
}
