import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { EngagementService, EngagementUnavailableError, NEWSLETTER_DUPLICATE_STATUS } from '../../../../services/engagement-service';

@Component({
  selector: 'app-events-newsletter',
  standalone: false,
  styleUrl: './events-newsletter.css',
  templateUrl: './events-newsletter.html',
})
export class EventsNewsletter {
  private readonly engagement = inject(EngagementService);

  protected readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  protected readonly form = new FormGroup({ email: this.email });
  protected readonly state = signal<'idle' | 'sending' | 'done' | 'duplicate' | 'unavailable' | 'error'>('idle');

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
    this.engagement.subscribeNewsletter(this.email.value.trim(), 'events').subscribe({
      next: () => {
        this.state.set('done');
        this.email.reset();
      },
      error: (error) => {
        if (error.status === NEWSLETTER_DUPLICATE_STATUS) this.state.set('duplicate');
        else this.state.set(error instanceof EngagementUnavailableError ? 'unavailable' : 'error');
      },
    });
  }
}
