import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AuthResponse,
  ForgotPasswordResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  User,
} from '../models/user';

const STORAGE_KEY = 'lightbook.auth';

/**
 * Biết "ai đang đăng nhập" cho toàn web khách hàng.
 * Ghi nhớ đăng nhập → lưu localStorage (đóng trình duyệt vẫn còn),
 * không ghi nhớ → lưu sessionStorage (đóng tab là mất).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly session = signal<AuthResponse | null>(readSession());

  /** Người dùng hiện tại, null nếu chưa đăng nhập */
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);

  get token(): string | null {
    return this.session()?.token ?? null;
  }

  /** Gọi API đăng nhập. Thành công thì trang gọi tiếp setSession() */
  login(body: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, body);
  }

  /** Gọi API đăng ký. Thành công thì trang gọi tiếp setSession() để đăng nhập luôn */
  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/register`, body);
  }

  /** Gửi email chứa liên kết đặt lại mật khẩu */
  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(`${this.baseUrl}/forgot-password`, { email });
  }

  setSession(res: AuthResponse, remember: boolean): void {
    clearStorage();
    try {
      (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(res));
    } catch {
      // Trình duyệt chặn storage thì chỉ giữ đăng nhập trong phiên này
    }
    this.session.set(res);
  }

  logout(): void {
    clearStorage();
    this.session.set(null);
  }

  /** Cập nhật thông tin người dùng sau khi sửa hồ sơ */
  updateUser(user: User): void {
    const current = this.session();
    if (!current) return;
    const next = { ...current, user };
    const remember = hasItem(localStorage);
    this.setSession(next, remember);
  }
}

function readSession(): AuthResponse | null {
  for (const store of storages()) {
    try {
      const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? 'null') as AuthResponse | null;
      if (parsed && typeof parsed.token === 'string' && parsed.user?._id) return parsed;
    } catch {
      // bỏ qua dữ liệu hỏng
    }
  }
  return null;
}

function clearStorage(): void {
  for (const store of storages()) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

function hasItem(store: Storage): boolean {
  try {
    return store.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function storages(): Storage[] {
  return typeof window === 'undefined' ? [] : [localStorage, sessionStorage];
}
