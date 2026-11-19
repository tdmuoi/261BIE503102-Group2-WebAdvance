import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { MonoTypeOperatorFunction, Observable, catchError, map, of, shareReplay, tap, throwError, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AccountNotification,
  AccountProfile,
  Address,
  AddressRequest,
  ChangePasswordRequest,
  CreateOrderRequest,
  NotificationPage,
  NotificationType,
  Order,
  Province,
  UpdateProfileRequest,
  VoucherRequest,
  VoucherResult,
} from '../models/account';
import { PROVINCES } from '../models/provinces';
import { AuthService } from './auth-service';

export interface BuybackRequest {
  code: string;
  createdAt: string;
  bookCount: number;
  status: 'reviewing' | 'quoted' | 'completed';
  quote: number | null;
  note: string;
}

export interface MomoPaymentLink {
  payUrl: string;
  momoOrderId: string;
  test: boolean;
}

export interface StoreSettings {
  shipping: { standardFee: number; expressFee: number; freeShippingThreshold: number };
  promotions: { combosEnabled: boolean };
}

export interface MomoVerifyResult {
  status: 'paid' | 'pending' | 'failed';
  message: string | null;
  order: Order;
}

export interface EbookProgress {
  page: number;
  totalPages?: number;
  bookmarks: number[];
  notes: { id?: string; page: number; quote?: string; text: string }[];
  highlights: { page: number; text: string }[];
  lastReadAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/account`;
  readonly publicSettings = signal<StoreSettings | null>(null);
  readonly settingsError = signal(false);
  private settingsRequest?: Observable<StoreSettings>;
  readonly freeshipText = computed(() => {
    const shipping = this.publicSettings()?.shipping;
    return shipping ? shipping.freeShippingThreshold === 0 ? 'Miễn phí giao tiêu chuẩn'
      : `Freeship giao tiêu chuẩn từ ${shipping.freeShippingThreshold.toLocaleString('vi-VN')}đ`
      : 'Phí vận chuyển được xác nhận tại thanh toán';
  });

  getPublicSettings(refresh = false): Observable<StoreSettings> {
    if (refresh) {
      this.settingsRequest = undefined;
      this.publicSettings.set(null);
      this.settingsError.set(false);
    }
    this.settingsRequest ??= this.http.get<StoreSettings>(`${environment.apiUrl}/settings`).pipe(
      timeout(10000),
      map(settings => {
        if (!settings.shipping || ['standardFee', 'expressFee', 'freeShippingThreshold'].some(key => {
          const value = settings.shipping[key as keyof StoreSettings['shipping']];
          return !Number.isSafeInteger(value) || value < 0;
        })) throw new Error('Cấu hình vận chuyển không hợp lệ.');
        return settings;
      }),
      tap(settings => { this.publicSettings.set(settings); this.settingsError.set(false); }),
      catchError(error => { this.settingsRequest = undefined; this.publicSettings.set(null); this.settingsError.set(true); return throwError(() => error); }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.settingsRequest;
  }

  private readonly profileState = signal<AccountProfile | null>(null);
  private readonly profileErrorState = signal(false);
  private readonly unreadState = signal(0);

  readonly profile = this.profileState.asReadonly();
  readonly profileError = this.profileErrorState.asReadonly();
  readonly unreadCount = this.unreadState.asReadonly();

  setProfile(profile: AccountProfile | null): void {
    this.profileState.set(profile);
    if (profile) this.profileErrorState.set(false);
  }

  setProfileError(error: boolean): void {
    this.profileErrorState.set(error);
  }

  setUnreadCount(count: number): void {
    this.unreadState.set(Math.max(0, count));
  }

  getProfile(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>(`${this.baseUrl}/profile`, { headers: this.headers() }).pipe(this.on401());
  }

  updateProfile(body: UpdateProfileRequest): Observable<AccountProfile> {
    return this.http.put<AccountProfile>(`${this.baseUrl}/profile`, body, { headers: this.headers() }).pipe(this.on401());
  }

  uploadAvatar(url: string): Observable<{ avatar: string }> {
    return this.http.put<{ avatar: string }>(`${this.baseUrl}/avatar`, { avatar: url }, { headers: this.headers() }).pipe(this.on401());
  }

  deleteAvatar(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/avatar`, { headers: this.headers() }).pipe(this.on401());
  }

  changePassword(body: ChangePasswordRequest): Observable<{ passwordChangedAt: string }> {
    return this.http.put<{ passwordChangedAt: string }>(`${this.baseUrl}/password`, body, {
      headers: this.headers(),
    }).pipe(this.on401());
  }

  // ---------- Sổ địa chỉ ----------
  getAddresses(): Observable<Address[]> {
    return this.http.get<Address[]>(`${this.baseUrl}/addresses`, { headers: this.headers() }).pipe(this.on401());
  }

  createAddress(body: AddressRequest): Observable<Address[]> {
    return this.http.post<Address[]>(`${this.baseUrl}/addresses`, body, { headers: this.headers() }).pipe(this.on401());
  }

  updateAddress(id: string, body: AddressRequest): Observable<Address[]> {
    return this.http.put<Address[]>(`${this.baseUrl}/addresses/${id}`, body, { headers: this.headers() }).pipe(this.on401());
  }

  deleteAddress(id: string): Observable<Address[]> {
    return this.http.delete<Address[]>(`${this.baseUrl}/addresses/${id}`, { headers: this.headers() }).pipe(this.on401());
  }

  setDefaultAddress(id: string): Observable<Address[]> {
    return this.http.put<Address[]>(`${this.baseUrl}/addresses/${id}/default`, {}, { headers: this.headers() }).pipe(this.on401());
  }

  getLocations(): Observable<Province[]> {
    return of(PROVINCES);
  }

  // ---------- Thông báo ----------
  getNotifications(type: NotificationType | 'all', page: number): Observable<NotificationPage> {
    const params = { type, page };
    return this.http.get<NotificationPage>(`${this.baseUrl}/notifications`, { headers: this.headers(), params }).pipe(this.on401());
  }

  markNotificationRead(id: string): Observable<AccountNotification> {
    return this.http.put<AccountNotification>(`${this.baseUrl}/notifications/${id}/read`, {}, { headers: this.headers() }).pipe(this.on401());
  }

  markAllNotificationsRead(): Observable<{ unread: number }> {
    return this.http.put<{ unread: number }>(`${this.baseUrl}/notifications/read-all`, {}, { headers: this.headers() }).pipe(this.on401());
  }

  // ---------- Đơn hàng ----------
  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.baseUrl}/orders`, { headers: this.headers() }).pipe(this.on401());
  }

  createOrder(body: CreateOrderRequest, idempotencyKey: string): Observable<Order> {
    const snapshot: CreateOrderRequest = JSON.parse(JSON.stringify(body));
    return this.http.post<Order>(`${environment.apiUrl}/orders`, snapshot, {
      headers: this.headers().set('Idempotency-Key', idempotencyKey),
    }).pipe(timeout(20000), this.on401());
  }

  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${environment.apiUrl}/orders/${id}`, { headers: this.headers() }).pipe(this.on401());
  }

  requestReturn(orderId: string, body: { type: 'refund'; reason: string; description: string }) {
    return this.http.post<{ _id: string; requestCode: string; status: string }>(
      `${environment.apiUrl}/orders/${orderId}/returns`, body, { headers: this.headers() }).pipe(timeout(20000), this.on401());
  }

  cancelOrder(id: string): Observable<Order> {
    return this.http.put<Order>(`${this.baseUrl}/orders/${id}/cancel`, {}, { headers: this.headers() }).pipe(timeout(20000), this.on401());
  }

  confirmPayment(id: string): Observable<Order> {
    return this.http.post<Order>(`${environment.apiUrl}/orders/${id}/confirm-payment`, {}, { headers: this.headers() }).pipe(this.on401());
  }

  createMomoPayment(id: string, method: 'atm' | 'wallet' = 'atm'): Observable<MomoPaymentLink> {
    return this.http.post<MomoPaymentLink>(`${environment.apiUrl}/orders/${id}/momo`, { method }, { headers: this.headers() }).pipe(this.on401());
  }

  verifyMomoPayment(momoOrderId: string): Observable<MomoVerifyResult> {
    return this.http
      .post<MomoVerifyResult>(`${environment.apiUrl}/payments/momo/verify`, { momoOrderId }, { headers: this.headers() })
      .pipe(this.on401());
  }

  applyVoucher(body: VoucherRequest): Observable<VoucherResult> {
    return this.http.post<VoucherResult>(`${environment.apiUrl}/vouchers/apply`, body, { headers: this.headers() }).pipe(this.on401());
  }

  getBuybacks(): Observable<BuybackRequest[]> {
    return this.http.get<BuybackRequest[]>(`${this.baseUrl}/buybacks`, { headers: this.headers() }).pipe(this.on401());
  }

  // ---------- Tủ sách ----------
  getEbooks<T>(): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/ebooks`, { headers: this.headers() }).pipe(this.on401());
  }

  getEbookProgress(bookId: string): Observable<EbookProgress> {
    return this.http.get<EbookProgress>(`${this.baseUrl}/ebooks/${bookId}/progress`, { headers: this.headers() }).pipe(this.on401());
  }

  saveEbookProgress(bookId: string, body: EbookProgress): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/ebooks/${bookId}/progress`, body, { headers: this.headers() }).pipe(this.on401());
  }

  // ---------- Đánh giá ----------
  getMyRatings(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.baseUrl}/reviews`, { headers: this.headers() }).pipe(this.on401());
  }

  submitReview(body: { bookId: string; rating: number; tags: string[]; content: string; anonymous: boolean; images: string[] }): Observable<{ bookId: string; rating: number }> {
    return this.http.post<{ bookId: string; rating: number }>(`${environment.apiUrl}/reviews`, body, { headers: this.headers() }).pipe(this.on401());
  }

  private on401<T>(): MonoTypeOperatorFunction<T> {
    return tap({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.auth.expire();
          this.setProfile(null);
          this.setUnreadCount(0);
        }
      },
    });
  }

  private headers(): HttpHeaders {
    const token = this.auth.token;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
