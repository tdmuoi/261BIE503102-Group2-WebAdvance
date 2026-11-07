import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { EngagementService, EngagementUnavailableError, NEWSLETTER_DUPLICATE_STATUS } from '../../../../services/engagement-service';

/** Khối bản tin "Thư từ Lightbook every Thursday." — Figma 878:7502 */
@Component({
  selector: 'app-news-newsletter',
  standalone: false,
  styleUrls: ['./news-newsletter.css', './news-newsletter-popup.css'],
  templateUrl: './news-newsletter.html',
  host: { '(document:keydown.escape)': 'closePopup()' },
})
export class NewsNewsletter {
  private readonly engagement = inject(EngagementService);

  protected readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  /** (ngSubmit) cần formGroup, thiếu thì bấm nút chỉ reload trang */
  protected readonly form = new FormGroup({ email: this.email });
  protected readonly state = signal<'idle' | 'sending' | 'done' | 'duplicate' | 'unavailable' | 'error'>('idle');
  /** Pop-up báo kết quả: đăng ký xong hoặc email đã đăng ký từ trước */
  protected readonly popupOpen = computed(() => this.state() === 'done' || this.state() === 'duplicate');

  protected errorText(): string {
    if (!this.email.touched || !this.email.errors) return '';
    return this.email.errors['required'] ? 'Vui lòng nhập email.' : 'Email chưa đúng định dạng.';
  }

  protected closePopup(): void {
    if (this.popupOpen()) this.state.set('idle');
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
      error: (error) => {
        if (error.status === NEWSLETTER_DUPLICATE_STATUS) {
          this.state.set('duplicate');
          this.email.reset();
        } else {
          this.state.set(error instanceof EngagementUnavailableError ? 'unavailable' : 'error');
        }
      },
    });
  }
}
