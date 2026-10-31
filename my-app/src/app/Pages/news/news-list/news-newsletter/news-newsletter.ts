import { Component, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';

import { EngagementService, EngagementUnavailableError } from '../../../../services/engagement-service';

/** Khối bản tin "Thư từ Lightbook every Thursday." — Figma 878:7502 */
@Component({
  selector: 'app-news-newsletter',
  standalone: false,
  styleUrl: './news-newsletter.css',
  templateUrl: './news-newsletter.html',
})
export class NewsNewsletter {
  private readonly engagement = inject(EngagementService);

  protected readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  protected readonly state = signal<'idle' | 'sending' | 'done' | 'unavailable' | 'error'>('idle');

  protected errorText(): string {
    if (!this.email.touched || !this.email.errors) return '';
    return this.email.errors['required'] ? 'Vui lòng nhập email.' : 'Email chưa đúng định dạng.';
  }

  protected submit(): void {
    if (this.email.invalid) {
      this.email.markAsTouched();
      return;
    }
    this.state.set('sending');
    this.engagement.subscribeNewsletter(this.email.value.trim(), 'news').subscribe({
      next: () => {
        this.state.set('done');
        this.email.reset();
      },
      error: (error) => this.state.set(error instanceof EngagementUnavailableError ? 'unavailable' : 'error'),
    });
  }
}
