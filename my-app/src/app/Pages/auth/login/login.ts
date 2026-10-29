import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { LoginError, LoginMethod, LoginRequest } from '../../../models/user';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';
import { USE_MOCK_LOGIN, mockLogin } from './login.mock';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Số di động Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx */
const PHONE_PATTERN = /^(0|\+84)\d{9}$/;
const PASSWORD_MIN = 8;

@Component({
  selector: 'app-login',
  standalone: false,
  styleUrls: ['../auth-form.css', './login.css'],
  templateUrl: './login.html',
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly method = signal<LoginMethod>('email');
  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly submitted = signal(false);
  /** Lỗi từ server (sai thông tin, bị khoá, mất mạng) — hiện ở khung đỏ đầu form */
  readonly alert = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN)]],
    remember: [true],
  });

  ngOnInit(): void {
    // Đã đăng nhập rồi thì không cần ở trang này
    if (this.auth.isLoggedIn()) {
      this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
    }
  }

  setMethod(method: LoginMethod): void {
    if (this.method() === method) return;
    this.method.set(method);
    const control = this.form.controls.identifier;
    control.setValidators([
      Validators.required,
      Validators.pattern(method === 'email' ? EMAIL_PATTERN : PHONE_PATTERN),
    ]);
    control.setValue('');
    control.markAsUntouched();
    this.submitted.set(false);
    this.alert.set(null);
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  /** Lỗi hiện dưới ô nhập, chỉ hiện khi đã rời ô hoặc đã bấm Đăng nhập */
  fieldError(name: 'identifier' | 'password'): string | null {
    const control = this.form.controls[name];
    if (control.valid || !(control.touched || this.submitted())) return null;
    const isEmail = this.method() === 'email';
    if (name === 'identifier') {
      if (control.hasError('required')) return isEmail ? 'Vui lòng nhập email' : 'Vui lòng nhập số điện thoại';
      return isEmail ? 'Email chưa đúng định dạng' : 'Số điện thoại chưa đúng định dạng';
    }
    if (control.hasError('required')) return 'Vui lòng nhập mật khẩu';
    return `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự`;
  }

  submit(): void {
    this.submitted.set(true);
    this.alert.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.loading()) return;

    const { identifier, password, remember } = this.form.getRawValue();
    const body: LoginRequest = { identifier: identifier.trim(), type: this.method(), password, remember };
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có POST /api/auth/login
    const request$ = USE_MOCK_LOGIN ? mockLogin(body) : this.auth.login(body);

    this.loading.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.auth.setSession(res, remember);
        this.loading.set(false);
        this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.alert.set(this.errorMessage(err));
      },
    });
  }

  /** Đã gõ email hợp lệ thì mang sang trang Quên mật khẩu để điền sẵn */
  forgotParams(): Record<string, string> {
    const control = this.form.controls.identifier;
    return this.method() === 'email' && control.valid ? { email: control.value.trim() } : {};
  }

  socialLogin(provider: 'Google' | 'Facebook'): void {
    this.toast.show(`Đăng nhập bằng ${provider} sắp ra mắt`);
  }

  private errorMessage(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    if (err.status === 0) return 'Không kết nối được máy chủ. Vui lòng thử lại sau.';

    const body = (err.error ?? {}) as LoginError;
    if (err.status === 423 || body.lockedUntil) {
      const ms = body.lockedUntil ? new Date(body.lockedUntil).getTime() - Date.now() : 0;
      const minutes = Math.max(1, Math.ceil(ms / 60000));
      return `Tài khoản đang tạm khoá. Vui lòng thử lại sau ${minutes} phút.`;
    }
    if (typeof body.remainingAttempts === 'number') {
      const who = this.method() === 'email' ? 'Email' : 'Số điện thoại';
      return `${who} hoặc mật khẩu chưa chính xác. Bạn còn ${body.remainingAttempts} lần thử trước khi tài khoản bị tạm khoá 15 phút.`;
    }
    return body.message ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  }

  /** Trang cần quay lại sau khi đăng nhập (?returnUrl=/account/orders), chỉ nhận đường dẫn nội bộ */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }
}
