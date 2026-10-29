import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';

import { ForgotPasswordResponse } from '../../../models/user';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';
import { USE_MOCK_FORGOT, mockForgotPassword } from './forgot-password.mock';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Thời gian chờ mặc định trước khi được gửi lại (giây) */
const RESEND_SECONDS = 30;

@Component({
  selector: 'app-forgot-password',
  standalone: false,
  styleUrls: ['../auth-form.css', './forgot-password.css'],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);
  /** Email đã gửi liên kết — có giá trị thì hiện màn hình "Kiểm tra hộp thư" */
  readonly sentTo = signal<string | null>(null);
  /** Số giây còn lại trước khi được bấm "Gửi lại email" */
  readonly countdown = signal(0);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
  });

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  ngOnInit(): void {
    // Trang Đăng nhập truyền sang ?email=... nếu người dùng đã gõ email
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) this.form.controls.email.setValue(email);
  }

  emailError(): string | null {
    const c = this.form.controls.email;
    if (c.valid || !(c.touched || this.submitted())) return null;
    return c.hasError('required') ? 'Vui lòng nhập email' : 'Email chưa đúng định dạng';
  }

  /** 00:30 */
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
    const email = this.form.controls.email.value.trim().toLowerCase();
    this.send(email, () => this.sentTo.set(email));
  }

  resend(): void {
    const email = this.sentTo();
    if (!email || this.countdown() > 0 || this.loading()) return;
    this.send(email, () => this.toast.show(`Đã gửi lại email tới ${email}`));
  }

  private send(email: string, onSuccess: () => void): void {
    if (this.loading()) return;
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có POST /api/auth/forgot-password
    const request$: Observable<ForgotPasswordResponse> = USE_MOCK_FORGOT
      ? mockForgotPassword(email)
      : this.auth.forgotPassword(email);

    this.loading.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.loading.set(false);
        onSuccess();
        this.startCountdown(res.resendAfter ?? RESEND_SECONDS);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        const message =
          err?.status === 0
            ? 'Không kết nối được máy chủ. Vui lòng thử lại sau.'
            : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
        // Đang ở màn hình "đã gửi" thì báo bằng toast, còn lại hiện khung lỗi trên form
        if (this.sentTo()) this.toast.show(message);
        else this.serverError.set(message);
      },
    });
  }

  private startCountdown(seconds: number): void {
    this.stopTimer();
    this.countdown.set(seconds);
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
