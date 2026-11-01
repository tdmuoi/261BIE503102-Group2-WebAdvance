import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Voucher,
  VoucherListResponse,
  VoucherPayload,
  VoucherQuery,
  VoucherReportResponse,
} from '../models/voucher';
import { AdminAuthService } from './admin-auth-service';

@Injectable({ providedIn: 'root' })
export class VoucherService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/vouchers`;

  getVouchers(query: VoucherQuery = {}): Observable<VoucherListResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params = params.set(key, String(value));
    }
    return this.auth
      .withSession(() =>
        this.http.get<VoucherListResponse>(this.baseUrl, { params, withCredentials: true }),
      )
      .pipe(timeout(15000));
  }
  getVoucher(id: string): Observable<Voucher> {
    return this.auth
      .withSession(() =>
        this.http.get<Voucher>(`${this.baseUrl}/${encodeURIComponent(id)}`, {
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }
  createVoucher(data: VoucherPayload): Observable<Voucher> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.post<Voucher>(this.baseUrl, data, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }
  updateVoucher(id: string, data: VoucherPayload): Observable<Voucher> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.put<Voucher>(`${this.baseUrl}/${encodeURIComponent(id)}`, data, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }
  setPaused(id: string, paused: boolean): Observable<Voucher> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.patch<Voucher>(
          `${this.baseUrl}/${encodeURIComponent(id)}/status`,
          { paused },
          {
            withCredentials: true,
            headers: { 'X-Admin-CSRF': csrfToken },
          },
        ),
      )
      .pipe(timeout(15000));
  }
  getReport(): Observable<VoucherReportResponse> {
    return this.auth
      .withSession(() =>
        this.http.get<VoucherReportResponse>(`${this.baseUrl}/report`, { withCredentials: true }),
      )
      .pipe(timeout(15000));
  }
}
