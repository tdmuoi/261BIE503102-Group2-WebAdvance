import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { RegisterError, RegisterRequest } from '../../../models/user';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';
import { USE_MOCK_REGISTER, mockRegister } from './register.mock';

const NAME_PATTERN = /^[\p{L}][\p{L}\s'.-]*[\p{L}]$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Số di động Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx */
const PHONE_PATTERN = /^(0|\+84)\d{9}$/;
const PASSWORD_MIN = 8;

type FieldName = 'fullName' | 'email' | 'phone' | 'password' | 'confirmPassword';

/** Mật khẩu phải có cả chữ và số */
function letterAndDigit(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  return !value || (/\p{L}/u.test(value) && /\d/.test(value)) ? null : { letterDigit: true };
}

/** Ô "Nhập lại mật khẩu" phải trùng ô "Mật khẩu" */
function sameAsPassword(control: AbstractControl): ValidationErrors | null {
  const password = control.parent?.get('password')?.value;
  return !control.value || control.value === password ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: false,
  styleUrls: ['../auth-form.css', './register.css'],
  templateUrl: './register.html',
})
export class Register implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);
  readonly loading = signal(false);
  readonly submitted = signal(false);
  /** Lỗi server không gắn được vào ô nào (mất mạng, lỗi lạ) */
  readonly serverError = signal<string | null>(null);
  /** Đăng ký xong: hiện màn hình chào mừng thay cho form */
  readonly done = signal<{ email: string; coupon: string | null } | null>(null);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(NAME_PATTERN)]],
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    phone: ['', [Validators.pattern(PHONE_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN), letterAndDigit]],
    confirmPassword: ['', [Validators.required, sameAsPassword]],
    terms: [false, [Validators.requiredTrue]],
    newsletter: [false],
  });

  constructor() {
    // Đổi mật khẩu thì kiểm tra lại ô nhập lại
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity({ emitEvent: false }));
  }

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
    }
  }

  /** Ô đã được người dùng chạm vào hoặc đã bấm Tạo tài khoản */
  private shown(control: AbstractControl): boolean {
    return control.touched || this.submitted();
  }

  fieldError(name: FieldName): string | null {
    const c = this.form.controls[name];
    if (c.valid || !this.shown(c)) return null;
    const e = c.errors ?? {};
    if (e['taken']) return e['taken'];
    switch (name) {
      case 'fullName':
        return e['required'] ? 'Vui lòng nhập họ và tên' : 'Họ tên chỉ gồm chữ cái, ít nhất 2 ký tự';
      case 'email':
        return e['required'] ? 'Vui lòng nhập email' : 'Email chưa đúng định dạng';
      case 'phone':
        return 'Số điện thoại chưa đúng định dạng';
      case 'password':
        if (e['required']) return 'Vui lòng nhập mật khẩu';
        if (e['minlength']) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự`;
        return 'Mật khẩu cần có cả chữ và số';
      case 'confirmPassword':
        return e['required'] ? 'Vui lòng nhập lại mật khẩu' : 'Mật khẩu nhập lại chưa khớp';
    }
  }

  /** Viền xanh khi ô đã nhập và hợp lệ (ô trống không bắt buộc thì để bình thường) */
  fieldOk(name: FieldName): boolean {
    const c = this.form.controls[name];
    return c.valid && this.shown(c) && c.value !== '';
  }

  termsError(): boolean {
    const c = this.form.controls.terms;
    return c.invalid && this.shown(c);
  }

  /** Số ô đang sai — hiện ở khung "Còn N trường cần sửa" sau khi bấm Tạo tài khoản */
  invalidCount(): number {
    return Object.values(this.form.controls).filter((c) => c.invalid).length;
  }

  submit(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.loading()) return;

    const v = this.form.getRawValue();
    const body: RegisterRequest = {
      fullName: v.fullName.trim(),
      email: v.email.trim().toLowerCase(),
      phone: v.phone.trim() || null,
      password: v.password,
      newsletter: v.newsletter,
    };
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có POST /api/auth/register
    const request$ = USE_MOCK_REGISTER ? mockRegister(body) : this.auth.register(body);

    this.loading.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ token, user, coupon }) => {
        // Đăng ký xong thì đăng nhập luôn
        this.auth.setSession({ token, user }, true);
        this.loading.set(false);
        this.done.set({ email: user.email, coupon: coupon?.code ?? null });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.handleError(err);
      },
    });
  }

  copyCoupon(code: string): void {
    const ok = () => this.toast.show(`Đã sao chép mã ${code}`);
    const fail = () => this.toast.show('Chưa sao chép được, bạn hãy chép mã thủ công nhé');
    if (!navigator.clipboard) return fail();
    navigator.clipboard.writeText(code).then(ok, fail);
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleConfirm(): void {
    this.showConfirm.update((v) => !v);
  }

  socialLogin(provider: 'Google' | 'Facebook'): void {
    this.toast.show(`Đăng nhập bằng ${provider} sắp ra mắt`);
  }

  private handleError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        this.serverError.set('Không kết nối được máy chủ. Vui lòng thử lại sau.');
        return;
      }
      const body = (err.error ?? {}) as RegisterError;
      // Email / SĐT đã có người dùng → đánh dấu đỏ đúng ô đó
      if (err.status === 409 && body.field) {
        const control = this.form.controls[body.field];
        const fallback = body.field === 'email' ? 'Email này đã được đăng ký' : 'Số điện thoại này đã được đăng ký';
        control.setErrors({ taken: body.message ?? fallback });
        control.markAsTouched();
        return;
      }
      if (body.message) {
        this.serverError.set(body.message);
        return;
      }
    }
    this.serverError.set('Đã có lỗi xảy ra. Vui lòng thử lại.');
  }

  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }
}
