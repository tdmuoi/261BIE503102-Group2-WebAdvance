import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { LbEvent } from '../../../models/content';
import { EngagementService, EngagementUnavailableError } from '../../../services/engagement-service';
import { longDate, placeLabel, seatsLeft } from '../../../shared/event-utils';

const PHONE_PATTERN = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
/** Mỗi lượt giữ tối đa 5 chỗ */
const MAX_SEATS = 5;

const MESSAGES: Record<string, Record<string, string>> = {
  fullName: { required: 'Vui lòng nhập họ tên.', minlength: 'Họ tên quá ngắn.', maxlength: 'Họ tên tối đa 80 ký tự.' },
  email: { required: 'Vui lòng nhập email.', email: 'Email chưa đúng định dạng.' },
  phone: { required: 'Vui lòng nhập số điện thoại.', pattern: 'Số điện thoại chưa đúng (ví dụ 0912345678).' },
  seats: { required: 'Vui lòng chọn số chỗ.', min: 'Ít nhất 1 chỗ.', max: 'Vượt quá số chỗ còn lại.' },
};

/** Hộp thoại "Giữ chỗ miễn phí" cho một sự kiện */
@Component({
  selector: 'app-event-reserve',
  standalone: false,
  styleUrl: './event-reserve.css',
  templateUrl: './event-reserve.html',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class EventReserve {
  private readonly engagement = inject(EngagementService);

  readonly event = input.required<LbEvent>();
  readonly closed = output<void>();

  protected readonly state = signal<'idle' | 'sending' | 'done' | 'unavailable' | 'error'>('idle');
  protected readonly when = computed(() => longDate(this.event()));
  protected readonly place = computed(() => placeLabel(this.event()));
  /** Số chỗ chọn được: không vượt chỗ còn lại */
  protected readonly seatOptions = computed(() => {
    const left = seatsLeft(this.event()) ?? MAX_SEATS;
    return Array.from({ length: Math.max(Math.min(left, MAX_SEATS), 1) }, (_, i) => i + 1);
  });

  protected readonly form = new FormGroup({
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(PHONE_PATTERN)] }),
    seats: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(MAX_SEATS)] }),
  });

  /** Lỗi đầu tiên của ô (chỉ hiện sau khi đã chạm vào ô hoặc bấm gửi) */
  protected error(name: 'fullName' | 'email' | 'phone' | 'seats'): string {
    const control = this.form.controls[name];
    if (!control.errors || !control.touched) return '';
    const key = Object.keys(control.errors)[0];
    return MESSAGES[name][key] ?? 'Giá trị chưa hợp lệ.';
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.state.set('sending');
    this.engagement
      .reserveEvent({
        eventId: this.event()._id,
        fullName: value.fullName.trim(),
        email: value.email.trim(),
        phone: value.phone.trim(),
        seats: Number(value.seats),
      })
      .subscribe({
        next: () => this.state.set('done'),
        error: (error) => this.state.set(error instanceof EngagementUnavailableError ? 'unavailable' : 'error'),
      });
  }
}
