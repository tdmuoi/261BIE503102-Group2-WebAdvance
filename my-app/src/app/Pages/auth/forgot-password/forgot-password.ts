import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ValidationErrors, Validators, COMPOSITION_BUFFER_MODE } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { OtpError } from '../../../models/user';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const RESEND_SECONDS = 60;

function letterAndDigit(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  return !value || (/\p{L}/u.test(value) && /\d/.test(value)) ? null : { letterDigit: true };
}

function sameAsPassword(control: AbstractControl): ValidationErrors | null {
  const password = control.parent?.get('password')?.value;
  return !control.value || control.value === password ? null : { mismatch: true };
}

@Component({
  selector: 'app-forgot-password',
  standalone: false,
  styleUrls: ['../auth-form.css', './forgot-password.css'],
  templateUrl: './forgot-password.html',
  providers: [{ provide: COMPOSITION_BUFFER_MODE, useValue: false }],
})
export class ForgotPassword implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly resetSubmitted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly sentTo = signal<string | null>(null);
  readonly done = signal(false);
  readonly showPassword = signal(false);
  readonly countdown = signal(0);

  private challengeId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
  });

  readonly resetForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN), letterAndDigit]],
    confirmPassword: ['', [Validators.required, sameAsPassword]],
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
    this.resetForm.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.resetForm.controls.confirmPassword.updateValueAndValidity({ emitEvent: false }));
  }

  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) this.form.controls.email.setValue(email);
  }

  emailError(): string | null {
    const c = this.form.controls.email;
    if (c.valid || !(c.touched || this.submitted())) return null;
    return c.hasError('required') ? 'Vui lòng nhập email' : 'Email chưa đúng định dạng';
  }

  resetError(name: 'code' | 'password' | 'confirmPassword'): string | null {
    const c = this.resetForm.controls[name];
    if (c.valid || !(c.touched || this.resetSubmitted())) return null;
    const e = c.errors ?? {};
    if (name === 'code') return e['required'] ? 'Vui lòng nhập mã OTP' : 'Mã OTP gồm đúng 6 chữ số';
    if (name === 'password') {
      if (e['required']) return 'Vui lòng nhập mật khẩu mới';
      if (e['minlength']) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự`;
      return 'Mật khẩu cần có cả chữ và số';
    }
    return e['required'] ? 'Vui lòng nhập lại mật khẩu' : 'Mật khẩu nhập lại chưa khớp';
  }

  onCodeInput(): void {
    const c = this.resetForm.controls.code;
    const digits = c.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== c.value) c.setValue(digits);
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  countdownText(): string {
    const s = this.countdown();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.loading()) return;
    const email = this.form.controls.email.value.trim().toLowerCase();
    this.loading.set(true);
    this.auth
      .forgotPassword(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.challengeId = res.challengeId ?? null;
          this.sentTo.set(res.email || email);
          this.startCountdown(res.resendAfter ?? RESEND_SECONDS);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.serverError.set(this.message(err));
        },
      });
  }

  resend(): void {
    if (!this.challengeId || this.countdown() > 0 || this.loading()) return;
    this.loading.set(true);
    this.auth
      .resendOtp(this.challengeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.serverError.set(null);
          this.resetForm.controls.code.setValue('');
          this.toast.show(`Đã gửi lại mã tới ${this.sentTo()}`);
          this.startCountdown(res.resendAfter ?? RESEND_SECONDS);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          const body = (err instanceof HttpErrorResponse ? err.error : null) as OtpError | null;
          if (body?.retryAfter) this.startCountdown(body.retryAfter);
          this.serverError.set(this.message(err));
        },
      });
  }

  reset(): void {
    this.resetSubmitted.set(true);
    this.serverError.set(null);
    this.onCodeInput();
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    if (!this.challengeId || this.loading()) return;
    const { code, password } = this.resetForm.getRawValue();
    this.loading.set(true);
    this.auth
      .resetPassword(this.challengeId, code, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.stopTimer();
          this.done.set(true);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.resetForm.controls.code.setValue('');
          this.serverError.set(this.message(err));
        },
      });
  }

  startOver(): void {
    this.stopTimer();
    this.challengeId = null;
    this.sentTo.set(null);
    this.serverError.set(null);
    this.resetSubmitted.set(false);
    this.resetForm.reset();
  }

  private message(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    if (err.status === 0) return 'Không kết nối được máy chủ. Vui lòng thử lại sau.';
    return ((err.error ?? {}) as OtpError).message ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.';
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
