import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators, COMPOSITION_BUFFER_MODE } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { LoginError, LoginMethod, LoginRequest, OtpChallenge, VerifiedResponse, needsOtp } from '../../../models/user';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^(0|\+84)\d{9}$/;
const PASSWORD_MIN = 8;

@Component({
  selector: 'app-login',
  standalone: false,
  styleUrls: ['../auth-form.css', './login.css'],
  templateUrl: './login.html',
  providers: [{ provide: COMPOSITION_BUFFER_MODE, useValue: false }],
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
  readonly alert = signal<string | null>(null);
  readonly otp = signal<OtpChallenge | null>(null);
  private remember = true;

  readonly form = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN)]],
    remember: [true],
  });

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const oauthError = query.get('oauthError');
    const oauthCode = query.get('oauth');
    if (oauthError) {
      this.alert.set(oauthError);
      return;
    }
    if (oauthCode) {
      this.finishSocialLogin(oauthCode);
      return;
    }
    if (this.auth.isLoggedIn()) {
      this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
    }
  }

  private finishSocialLogin(code: string): void {
    this.remember = true;
    this.loading.set(true);
    this.auth.exchangeSocialLogin(code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (needsOtp(res)) {
          this.otp.set(res);
          return;
        }
        this.auth.setSession(res, true);
        if (res.coupon?.code) this.toast.show(`Chào mừng bạn đến với Lightbook! Mã ưu đãi thành viên mới: ${res.coupon.code}`);
        this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.alert.set(this.errorMessage(err));
      },
    });
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
    const request$ = this.auth.login(body);

    this.remember = remember;
    this.loading.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        if (needsOtp(res)) {
          this.loading.set(false);
          this.otp.set(res);
          return;
        }
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

  onVerified(res: VerifiedResponse): void {
    this.auth.setSession({ token: res.token, user: res.user }, this.remember);
    if (res.coupon?.code) this.toast.show(`Email đã được xác minh. Mã ưu đãi thành viên mới: ${res.coupon.code}`);
    this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
  }

  cancelOtp(): void {
    this.otp.set(null);
    this.form.controls.password.setValue('');
    this.submitted.set(false);
  }

  forgotParams(): Record<string, string> {
    const control = this.form.controls.identifier;
    return this.method() === 'email' && control.valid ? { email: control.value.trim() } : {};
  }

  socialLogin(provider: 'Google' | 'Facebook'): void {
    if (this.loading()) return;
    window.location.assign(this.auth.socialLoginUrl(provider === 'Google' ? 'google' : 'facebook', this.returnUrl()));
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

  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }
}
