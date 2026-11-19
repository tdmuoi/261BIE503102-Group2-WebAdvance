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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly session = signal<AuthResponse | null>(readSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);

  get token(): string | null {
    return this.session()?.token ?? null;
  }

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, body);
  }

  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/register`, body);
  }

  verifyOtp(challengeId: string, code: string): Observable<VerifiedResponse> {
    return this.http.post<VerifiedResponse>(`${this.baseUrl}/otp/verify`, { challengeId, code });
  }

  resendOtp(challengeId: string): Observable<OtpChallenge> {
    return this.http.post<OtpChallenge>(`${this.baseUrl}/otp/resend`, { challengeId });
  }

  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(`${this.baseUrl}/forgot-password`, { email });
  }

  resetPassword(challengeId: string, code: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/reset-password`, { challengeId, code, newPassword });
  }

  setSession(res: AuthResponse, remember: boolean): void {
    clearStorage();
    try {
      (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(res));
    } catch {
    }
    this.session.set(res);
  }

  logout(): void {
    const token = this.token;
    if (token) {
      this.http
        .post(`${this.baseUrl}/logout`, {}, { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) })
        .subscribe({ error: () => undefined });
    }
    this.clearLocal();
  }

  expire(): void {
    if (this.session()) this.clearLocal();
  }

  private clearLocal(): void {
    clearStorage();
    clearUserData();
    this.session.set(null);
  }

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
    }
  }
  return null;
}

function clearStorage(): void {
  for (const store of storages()) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
    }
  }
}

const USER_DATA_PREFIXES = ['lightbook.reader.', 'lightbook.wishlist'];
const USER_DATA_KEEP = ['lightbook.reader.settings'];

function clearUserData(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !USER_DATA_KEEP.includes(key) && USER_DATA_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch {
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
