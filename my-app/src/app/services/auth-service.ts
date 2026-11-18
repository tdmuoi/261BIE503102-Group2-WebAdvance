import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AuthResponse,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  OtpChallenge,
  RegisterRequest,
  RegisterResponse,
  User,
  VerifiedResponse,
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

  /**
   * Gọi API đăng nhập. Có token thì trang gọi tiếp setSession();
   * có challengeId (needsOtp) thì phải nhập mã OTP gửi qua email trước.
   */
  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, body);
  }

  /** Gọi API đăng ký. Server gửi OTP xác minh email; nhập đúng mã (verifyOtp) mới đăng nhập */
  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/register`, body);
  }

  /** Xác nhận mã OTP (xác minh email / xác thực 2 lớp). Đúng mã thì trả token để setSession() */
  verifyOtp(challengeId: string, code: string): Observable<VerifiedResponse> {
    return this.http.post<VerifiedResponse>(`${this.baseUrl}/otp/verify`, { challengeId, code });
  }

  /** Gửi lại mã OTP mới (chờ 60 giây giữa 2 lần) */
  resendOtp(challengeId: string): Observable<OtpChallenge> {
    return this.http.post<OtpChallenge>(`${this.baseUrl}/otp/resend`, { challengeId });
  }

  /** Gửi mã OTP đặt lại mật khẩu về email */
  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(`${this.baseUrl}/forgot-password`, { email });
  }

  /** Đặt mật khẩu mới bằng mã OTP; thành công thì mọi thiết bị bị đăng xuất */
  resetPassword(challengeId: string, code: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/reset-password`, { challengeId, code, newPassword });
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

  /**
   * Đăng xuất: báo server huỷ token (không chờ kết quả), xoá phiên và dữ liệu riêng của người này
   * lưu trên trình duyệt (tiến độ đọc ebook...) để người đăng nhập sau không thấy.
   */
  logout(): void {
    const token = this.token;
    if (token) {
      this.http
        .post(`${this.baseUrl}/logout`, {}, { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) })
        .subscribe({ error: () => undefined });
    }
    this.clearLocal();
  }

  /** Server trả 401 (token hết hạn / bị huỷ): xoá phiên, không gọi lại server */
  expire(): void {
    if (this.session()) this.clearLocal();
  }

  private clearLocal(): void {
    clearStorage();
    clearUserData();
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

/** Khoá localStorage chứa dữ liệu riêng của người đang đăng nhập */
const USER_DATA_PREFIXES = ['lightbook.reader.', 'lightbook.wishlist'];
const USER_DATA_KEEP = ['lightbook.reader.settings'];

function clearUserData(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !USER_DATA_KEEP.includes(key) && USER_DATA_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch {
    // ignore
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
