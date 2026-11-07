import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminAuthService } from './admin-auth-service';
import { environment } from '../../environments/environment';
import { ReturnListResponse, ReturnQuery, ReturnRequest, ReturnStatus } from '../models/return-request';

/** Gọi API Đổi trả & hoàn tiền — my-server/routes/admin-returns.js */
@Injectable({ providedIn: 'root' })
export class ReturnService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/returns`;

  getReturns(query: ReturnQuery = {}): Observable<ReturnListResponse> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
    });
    return this.http.get<ReturnListResponse>(this.baseUrl, { params, withCredentials: true });
  }

  getReturn(id: string): Observable<ReturnRequest> {
    return this.http.get<ReturnRequest>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  /** Từ chối cần note; hoàn tiền cần refundAmount; nhận sách có thể restock (cộng lại kho) */
  changeStatus(id: string, body: { status: ReturnStatus; note?: string; refundAmount?: number; restock?: boolean }): Observable<ReturnRequest> {
    return this.auth.withSession((csrfToken) => this.http.patch<ReturnRequest>(`${this.baseUrl}/${id}/status`, body, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  saveNote(id: string, adminNote: string): Observable<ReturnRequest> {
    return this.auth.withSession((csrfToken) => this.http.patch<ReturnRequest>(`${this.baseUrl}/${id}`, { adminNote }, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }
}
