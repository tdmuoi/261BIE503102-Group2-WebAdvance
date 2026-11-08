import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminAuthService } from './admin-auth-service';
import { environment } from '../../environments/environment';
import { Banner, BannerListResponse, BannerPayload } from '../models/banner';

/** Gọi API Banner & quảng cáo — my-server/routes/admin-banners.js */
@Injectable({ providedIn: 'root' })
export class BannerService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/banners`;

  getBanners(): Observable<BannerListResponse> {
    return this.http.get<BannerListResponse>(this.baseUrl, { withCredentials: true });
  }

  createBanner(data: BannerPayload): Observable<Banner> {
    return this.auth.withSession((csrfToken) => this.http.post<Banner>(this.baseUrl, data, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  updateBanner(id: string, data: BannerPayload): Observable<Banner> {
    return this.auth.withSession((csrfToken) => this.http.put<Banner>(`${this.baseUrl}/${id}`, data, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  /** Bật / tắt nhanh */
  setActive(id: string, active: boolean, revision: string | null = null): Observable<Banner> {
    return this.auth.withSession((csrfToken) => this.http.patch<Banner>(`${this.baseUrl}/${id}`, { active, revision }, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  /** Lưu thứ tự mới của các banner trong cùng 1 vị trí */
  reorder(ids: string[], revisions: Record<string, string | null> = {}): Observable<{ reordered: number }> {
    return this.auth.withSession((csrfToken) => this.http.patch<{ reordered: number }>(`${this.baseUrl}/reorder`, { ids, revisions }, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  deleteBanner(id: string, revision: string | null = null): Observable<{ deleted: boolean }> {
    return this.auth.withSession((csrfToken) => this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/${id}`, { body: { revision }, withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }
}
