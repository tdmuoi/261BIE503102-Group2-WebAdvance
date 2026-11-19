import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators, COMPOSITION_BUFFER_MODE } from '@angular/forms';

import { OtpChallenge, OtpError, VerifiedResponse } from '../../../models/user';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';

/**
 * Bước nhập mã OTP 6 số gửi qua email — dùng chung cho trang Đăng ký (xác minh email)
 * và Đăng nhập (chưa xác minh email / xác thực 2 lớp).
 *   <app-otp-verify [challenge]="otp" (verified)="onVerified($event)" (back)="otp.set(null)" />
 * Nhập đúng mã thì phát (verified) kèm token; trang cha tự lưu phiên.
 */
@Component({
  selector: 'app-otp-verify',
  standalone: false,
  styleUrls: ['../auth-form.css', './otp-verify.css'],
  templateUrl: './otp-verify.html',
  // Bộ gõ tiếng Việt (Unikey/Telex) có thể để Angular kẹt ở trạng thái "đang gõ dở"
  // khiến ô nhập không cập nhật vào form → tắt chờ composition, luôn đồng bộ theo sự kiện input.
  providers: [{ provide: COMPOSITION_BUFFER_MODE, useValue: false }],
})
export class OtpVerify implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly challenge = input.required<OtpChallenge>();
  readonly verified = output<VerifiedResponse>();
  readonly back = output<void>();

  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });
  readonly form = new FormGroup({ code: this.code });
  readonly loading = signal(false);
  readonly resending = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);
  /** Phiên OTP hết hạn / gửi lại quá nhiều lần → chỉ còn cách quay lại làm từ đầu */
  readonly expired = signal(false);
  /** Số giây còn lại trước khi được bấm "Gửi lại mã" */
  readonly countdown = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  ngOnInit(): void {
    this.startCountdown(this.challenge().resendAfter ?? 60);
  }

  isTwoFactor(): boolean {
    return this.challenge().purpose === 'login_2fa';
  }

  codeError(): string | null {
    if (this.code.valid || !(this.code.touched || this.submitted())) return null;
    return this.code.hasError('required') ? 'Vui lòng nhập mã OTP' : 'Mã OTP gồm đúng 6 chữ số';
  }

  /** Chỉ giữ chữ số (dán "123 456" vẫn được), tối đa 6 số */
  onInput(): void {
    const digits = this.code.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== this.code.value) this.code.setValue(digits);
  }

  countdownText(): string {
    const s = this.countdown();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.onInput();
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    if (this.loading()) return;
    this.loading.set(true);
    this.auth
      .verifyOtp(this.challenge().challengeId, this.code.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.verified.emit(res);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(this.message(err));
          this.code.setValue('');
        },
      });
  }

  resend(): void {
    if (this.countdown() > 0 || this.resending() || this.expired()) return;
    this.resending.set(true);
    this.error.set(null);
    this.auth
      .resendOtp(this.challenge().challengeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.resending.set(false);
          this.code.setValue('');
          this.submitted.set(false);
          this.toast.show(`Đã gửi mã mới tới ${res.email || this.challenge().email}`);
          this.startCountdown(res.resendAfter ?? 60);
        },
        error: (err: unknown) => {
          this.resending.set(false);
          const body = (err instanceof HttpErrorResponse ? err.error : null) as OtpError | null;
          if (body?.retryAfter) this.startCountdown(body.retryAfter);
          this.error.set(this.message(err));
        },
      });
  }

  private message(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    if (err.status === 0) return 'Không kết nối được máy chủ. Vui lòng thử lại sau.';
    const body = (err.error ?? {}) as OtpError;
    if (err.status === 410 || body.code === 'OTP_SESSION_EXPIRED' || body.code === 'OTP_TOO_MANY_SENDS') this.expired.set(true);
    return body.message ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  }

  private startCountdown(seconds: number): void {
    this.stopTimer();
    this.countdown.set(Math.max(0, Math.round(seconds)));
    if (this.countdown() === 0) return;
    this.timer = setInterval(() => {
      const next = this.countdown() - 1;
      this.countdown.set(Math.max(0, next));
      if (next <= 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
