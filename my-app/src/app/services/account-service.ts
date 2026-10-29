import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

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
} from '../models/account';
import { AuthService } from './auth-service';

/**
 * API khu vực Tài khoản (hồ sơ, ảnh đại diện, mật khẩu...). Mọi request gắn token đăng nhập.
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
    return this.http.get<AccountProfile>(`${this.baseUrl}/profile`, { headers: this.headers() });
  }

  updateProfile(body: UpdateProfileRequest): Observable<AccountProfile> {
    return this.http.put<AccountProfile>(`${this.baseUrl}/profile`, body, { headers: this.headers() });
  }

  /** multipart/form-data, field "avatar" — trả về URL ảnh mới */
  uploadAvatar(file: File): Observable<{ avatar: string }> {
    const form = new FormData();
    form.append('avatar', file);
    return this.http.post<{ avatar: string }>(`${this.baseUrl}/avatar`, form, { headers: this.headers() });
  }

  deleteAvatar(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/avatar`, { headers: this.headers() });
  }

  changePassword(body: ChangePasswordRequest): Observable<{ passwordChangedAt: string }> {
    return this.http.put<{ passwordChangedAt: string }>(`${this.baseUrl}/password`, body, {
      headers: this.headers(),
    });
  }

  // ---------- Sổ địa chỉ ----------
  getAddresses(): Observable<Address[]> {
    return this.http.get<Address[]>(`${this.baseUrl}/addresses`, { headers: this.headers() });
  }

  createAddress(body: AddressRequest): Observable<Address[]> {
    return this.http.post<Address[]>(`${this.baseUrl}/addresses`, body, { headers: this.headers() });
  }

  updateAddress(id: string, body: AddressRequest): Observable<Address[]> {
    return this.http.put<Address[]>(`${this.baseUrl}/addresses/${id}`, body, { headers: this.headers() });
  }

  deleteAddress(id: string): Observable<Address[]> {
    return this.http.delete<Address[]>(`${this.baseUrl}/addresses/${id}`, { headers: this.headers() });
  }

  setDefaultAddress(id: string): Observable<Address[]> {
    return this.http.put<Address[]>(`${this.baseUrl}/addresses/${id}/default`, {}, { headers: this.headers() });
  }

  /** Danh sách tỉnh/thành + phường/xã (không cần đăng nhập) */
  getLocations(): Observable<Province[]> {
    return this.http.get<Province[]>(`${environment.apiUrl}/locations`);
  }

  // ---------- Thông báo ----------
  getNotifications(type: NotificationType | 'all', page: number): Observable<NotificationPage> {
    const params = { type, page };
    return this.http.get<NotificationPage>(`${this.baseUrl}/notifications`, { headers: this.headers(), params });
  }

  markNotificationRead(id: string): Observable<AccountNotification> {
    return this.http.put<AccountNotification>(`${this.baseUrl}/notifications/${id}/read`, {}, { headers: this.headers() });
  }

  markAllNotificationsRead(): Observable<{ unread: number }> {
    return this.http.put<{ unread: number }>(`${this.baseUrl}/notifications/read-all`, {}, { headers: this.headers() });
  }

  // ---------- Đơn hàng ----------
  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.baseUrl}/orders`, { headers: this.headers() });
  }

  createOrder(body: CreateOrderRequest): Observable<Order> {
    return this.http.post<Order>(`${environment.apiUrl}/orders`, body, { headers: this.headers() });
  }

  cancelOrder(id: string): Observable<Order> {
    return this.http.put<Order>(`${this.baseUrl}/orders/${id}/cancel`, {}, { headers: this.headers() });
  }

  // ---------- Tủ sách ----------
  /** Thư viện ebook + tiến độ đọc. Kiểu dữ liệu: LibraryEbook (Pages/account/bookshelf-ebooks/bookshelf.mock.ts) */
  getEbooks<T>(): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/ebooks`, { headers: this.headers() });
  }

  // ---------- Đánh giá ----------
  /** bookId → số sao người dùng đã chấm */
  getMyRatings(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.baseUrl}/reviews`, { headers: this.headers() });
  }

  submitReview(body: { bookId: string; rating: number; tags: string[]; content: string; anonymous: boolean }, photos: File[] = []): Observable<{ bookId: string; rating: number }> {
    const form = new FormData();
    Object.entries(body).forEach(([key, value]) => form.append(key, Array.isArray(value) ? value.join(',') : String(value)));
    photos.forEach((file) => form.append('photos', file));
    return this.http.post<{ bookId: string; rating: number }>(`${environment.apiUrl}/reviews`, form, { headers: this.headers() });
  }

  private headers(): HttpHeaders {
    const token = this.auth.token;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
