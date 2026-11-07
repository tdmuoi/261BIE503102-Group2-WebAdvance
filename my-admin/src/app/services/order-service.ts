import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminAuthService } from './admin-auth-service';
import { environment } from '../../environments/environment';
import { Order, OrderListResponse, OrderQuery, OrderStatus, PaymentStatus } from '../models/order';

/** Gọi API Đơn hàng — my-server/routes/admin-orders.js */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/orders`;

  getOrders(query: OrderQuery = {}): Observable<OrderListResponse> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
    });
    return this.http.get<OrderListResponse>(this.baseUrl, { params, withCredentials: true });
  }

  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  /** Chuyển trạng thái theo luồng. Huỷ đơn bắt buộc có note (lý do); restock = cộng lại tồn kho */
  changeStatus(id: string, body: { status: OrderStatus; note?: string; trackingCode?: string; restock?: boolean }): Observable<Order> {
    return this.auth.withSession((csrfToken) => this.http.patch<Order>(`${this.baseUrl}/${id}/status`, body, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  update(id: string, body: { adminNote?: string; trackingCode?: string; paymentStatus?: PaymentStatus }): Observable<Order> {
    return this.auth.withSession((csrfToken) => this.http.patch<Order>(`${this.baseUrl}/${id}`, body, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }
}
