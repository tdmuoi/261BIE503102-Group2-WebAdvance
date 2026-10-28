import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Banner, BannerListResponse, BannerPayload } from '../models/banner';

/** Gọi API Banner & quảng cáo — my-server/routes/admin-banners.js */
@Injectable({ providedIn: 'root' })
export class BannerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/banners`;

  getBanners(): Observable<BannerListResponse> {
    return this.http.get<BannerListResponse>(this.baseUrl);
  }

  createBanner(data: BannerPayload): Observable<Banner> {
    return this.http.post<Banner>(this.baseUrl, data);
  }

  updateBanner(id: string, data: BannerPayload): Observable<Banner> {
    return this.http.put<Banner>(`${this.baseUrl}/${id}`, data);
  }

  /** Bật / tắt nhanh */
  setActive(id: string, active: boolean): Observable<Banner> {
    return this.http.patch<Banner>(`${this.baseUrl}/${id}`, { active });
  }

  /** Lưu thứ tự mới của các banner trong cùng 1 vị trí */
  reorder(ids: string[]): Observable<{ reordered: number }> {
    return this.http.patch<{ reordered: number }>(`${this.baseUrl}/reorder`, { ids });
  }

  deleteBanner(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/${id}`);
  }
}
