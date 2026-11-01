import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { timeout } from 'rxjs';
import { AdminAuthService } from '../../services/admin-auth-service';
import { environment } from '../../../environments/environment';
export type BuybackStatus = 'pending' | 'reviewing' | 'paid' | 'rejected';
export interface BuybackRequest {
  id: string;
  code: string;
  title: string;
  sender: string;
  phone: string;
  email: string;
  sellerId: string | null;
  condition: string;
  price: number | null;
  offerPrice: number | null;
  resalePrice: number | null;
  quantity: number | null;
  shipping: 'branch' | 'postal' | null;
  status: BuybackStatus;
  date: string;
  cover: string;
  coverText: string;
  images: string[];
  note: string;
  adminNote: string;
  isDemo: boolean;
  imageIsCatalogCover: boolean;
  conditionVerified: boolean;
  photosVerified: boolean;
  revision: string | null;
}
export function buybackError(e: HttpErrorResponse): string {
  return e.status === 0
    ? 'Không kết nối được API Buyback.'
    : e.status === 401
      ? 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
      : e.status === 403
        ? 'Chưa có quyền xử lý thanh lý.'
        : e.error?.message || 'Không tải hoặc lưu được yêu cầu thanh lý.';
}
@Injectable({ providedIn: 'root' })
export class BuybackService {
  private http = inject(HttpClient);
  private auth = inject(AdminAuthService);
  private url = `${environment.apiUrl}/admin/buybacks`;
  list() {
    return this.auth
      .withSession(() =>
        this.http.get<{ items: BuybackRequest[]; total: number; notice: string }>(this.url, {
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }
  get(id: string) {
    return this.auth
      .withSession(() =>
        this.http.get<BuybackRequest>(`${this.url}/${encodeURIComponent(id)}`, {
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }
  act(
    row: BuybackRequest,
    action: 'approve' | 'reject' | 'quote',
    extra: { note?: string; offerPrice?: number; resalePrice?: number } = {},
  ) {
    return this.auth
      .withSession((csrf) =>
        this.http.patch<BuybackRequest>(
          `${this.url}/${encodeURIComponent(row.id)}`,
          { action, revision: row.revision, ...extra },
          { withCredentials: true, headers: { 'X-Admin-CSRF': csrf } },
        ),
      )
      .pipe(timeout(15000));
  }
}
