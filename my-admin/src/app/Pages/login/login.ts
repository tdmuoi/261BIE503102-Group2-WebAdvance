import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, inject } from '@angular/core';
import { NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, TimeoutError, timeout } from 'rxjs';
import { AdminAuthService } from '../../services/admin-auth-service';

export class UserLogin {
  constructor(
    public email = '',
    public password = '',
    public rememberMe = false,
  ) {}
}
interface BookPreview {
  _id: string;
  title: string;
  image?: string;
  authorName?: string;
  categoryName?: string;
}

@Component({
  selector: 'app-login',
  standalone: false,
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login implements OnInit, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  user = new UserLogin();
  showPassword = false;
  books: BookPreview[] = [];
  loading = false;
  checking = true;
  error = '';
  message = '';
  private readonly requests = new Subscription();

  constructor(
    public readonly auth: AdminAuthService,
    private readonly router: Router,
  ) {}
  ngOnInit(): void {
    this.requests.add(
      this.auth.checkSession().pipe(timeout(10000)).subscribe({
        next: () => {
          this.checking = false;
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => {
          this.checking = false;
          if (!(error instanceof HttpErrorResponse && error.status === 401))
            this.error = this.describe(error);
          this.changeDetector.markForCheck();
        },
      }),
    );
  }
  ngOnDestroy(): void {
    this.requests.unsubscribe();
    this.user.password = '';
  }
  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image) image.hidden = true;
  }
  private describe(error: unknown): string {
    if (error instanceof TimeoutError)
      return 'Backend phản hồi quá lâu. Vui lòng kiểm tra server và thử đăng nhập lại.';
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0)
        return 'Không kết nối được Backend. Vui lòng kiểm tra server và mạng.';
      if (error.status === 404) return 'API xác thực Admin chưa được đăng ký trên Backend.';
      if (error.status === 401) return 'Email, mật khẩu hoặc quyền quản trị không hợp lệ.';
      if (error.status === 429) return 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return 'Không xử lý được yêu cầu. Vui lòng thử lại.';
  }
  onLogin(form: NgForm): void {
    if (this.loading || this.checking) return;
    form.control.markAllAsTouched();
    this.error = '';
    this.message = '';
    const email = this.user.email.trim().toLowerCase();
    if (
      form.invalid ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !this.user.password.length ||
      new TextEncoder().encode(this.user.password).length > 1024
    ) {
      this.error = 'Vui lòng nhập email hợp lệ và mật khẩu (tối đa 1024 byte).';
      return;
    }
    this.loading = true;
    this.requests.add(
      this.auth
        .login({ email, password: this.user.password, rememberMe: this.user.rememberMe })
        .pipe(timeout(15000))
        .subscribe({
          next: () => {
            this.user.password = '';
            this.loading = false;
            this.changeDetector.markForCheck();
            void this.router.navigate(['/dashboard']);
          },
          error: (error: unknown) => {
            this.user.password = '';
            this.loading = false;
            this.error = this.describe(error);
            this.changeDetector.markForCheck();
          },
        }),
    );
  }
  logout(): void {
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    this.message = '';
    this.requests.add(
      this.auth.logout().pipe(timeout(10000)).subscribe({
        next: () => {
          this.loading = false;
          this.user.password = '';
          this.message = 'Đã đăng xuất và kết thúc phiên.';
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => {
          this.loading = false;
          this.error = this.describe(error);
          this.changeDetector.markForCheck();
        },
      }),
    );
  }
}
