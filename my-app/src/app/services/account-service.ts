import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { MonoTypeOperatorFunction, Observable, of, tap } from 'rxjs';

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

/** Một yêu cầu thanh lý sách — GET /api/account/buybacks */
export interface BuybackRequest {
  code: string;
  createdAt: string;
  bookCount: number;
  status: 'reviewing' | 'quoted' | 'completed';
  quote: number | null;
  note: string;
}

/** Tiến độ đọc ebook lưu trên server — GET/PUT /api/account/ebooks/:bookId/progress */
export interface EbookProgress {
  page: number;
  totalPages?: number;
  bookmarks: number[];
  notes: { id?: string; page: number; quote?: string; text: string }[];
  highlights: { page: number; text: string }[];
  lastReadAt?: string | null;
}

/**
 * API web khách hàng cần đăng nhập (my-server/routes/customer-*.js). Mọi request gắn token.
 * Server trả 401 (token hết hạn) thì tự đăng xuất để trang chuyển về Đăng nhập.
 * Giữ hồ sơ hiện tại + số thông báo chưa đọc để menu bên và các trang con dùng chung.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/account`;

  private readonly profileState = signal<AccountProfile | null>(null);
  private readonly profileErrorState = signal(false);
  private readonly unreadState = signal(0);

  readonly profile = this.profileState.asReadonly();
  /** Tải hồ sơ bị lỗi — các trang con hiện thông báo lỗi thay vì chờ mãi */
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

  /** Ảnh đã thu nhỏ ở trình duyệt, gửi dạng data URL (server giới hạn ~90KB) */
  uploadAvatar(dataUrl: string): Observable<{ avatar: string }> {
    return this.http.put<{ avatar: string }>(`${this.baseUrl}/avatar`, { avatar: dataUrl }, { headers: this.headers() }).pipe(this.on401());
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

  /** Tỉnh/thành + phường/xã — my-server chưa có API địa giới, dùng danh sách tĩnh trong models/provinces.ts */
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
    }).pipe(this.on401());
  }

  /** Hỏi lại trạng thái đơn — dùng sau khi người dùng quét mã thanh toán online */
  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${environment.apiUrl}/orders/${id}`, { headers: this.headers() }).pipe(this.on401());
  }

  cancelOrder(id: string): Observable<Order> {
    return this.http.put<Order>(`${this.baseUrl}/orders/${id}/cancel`, {}, { headers: this.headers() }).pipe(this.on401());
  }

  /** Bản demo: người dùng bấm "Tôi đã thanh toán" (chưa nối cổng MoMo/VNPay thật) */
  confirmPayment(id: string): Observable<Order> {
    return this.http.post<Order>(`${environment.apiUrl}/orders/${id}/confirm-payment`, {}, { headers: this.headers() }).pipe(this.on401());
  }

  /** Kiểm tra mã giảm giá với giỏ hiện tại — POST /api/vouchers/apply */
  applyVoucher(body: VoucherRequest): Observable<VoucherResult> {
    return this.http.post<VoucherResult>(`${environment.apiUrl}/vouchers/apply`, body, { headers: this.headers() }).pipe(this.on401());
  }

  getBuybacks(): Observable<BuybackRequest[]> {
    return this.http.get<BuybackRequest[]>(`${this.baseUrl}/buybacks`, { headers: this.headers() }).pipe(this.on401());
  }

  // ---------- Tủ sách ----------
  /** Thư viện ebook + tiến độ đọc. Kiểu dữ liệu: LibraryEbook (Pages/account/bookshelf-ebooks/library.ts) */
  getEbooks<T>(): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/ebooks`, { headers: this.headers() }).pipe(this.on401());
  }

  /** 404 nếu sách không có trong tủ của người này */
  getEbookProgress(bookId: string): Observable<EbookProgress> {
    return this.http.get<EbookProgress>(`${this.baseUrl}/ebooks/${bookId}/progress`, { headers: this.headers() }).pipe(this.on401());
  }

  saveEbookProgress(bookId: string, body: EbookProgress): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/ebooks/${bookId}/progress`, body, { headers: this.headers() }).pipe(this.on401());
  }

  // ---------- Đánh giá ----------
  /** bookId → số sao người dùng đã chấm */
  getMyRatings(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.baseUrl}/reviews`, { headers: this.headers() }).pipe(this.on401());
  }

  /** Ảnh đính kèm chưa gửi lên (server chưa có chỗ lưu ảnh) */
  submitReview(body: { bookId: string; rating: number; tags: string[]; content: string; anonymous: boolean }): Observable<{ bookId: string; rating: number }> {
    return this.http.post<{ bookId: string; rating: number }>(`${environment.apiUrl}/reviews`, body, { headers: this.headers() }).pipe(this.on401());
  }

  /** Token hết hạn / bị huỷ → đăng xuất phía trình duyệt */
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
