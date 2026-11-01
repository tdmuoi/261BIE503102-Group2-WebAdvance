import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from '../../services/admin-auth-service';

export interface SettingsValues {
  storeName: string;
  slogan: string;
  supportEmail: string;
  hotline: string;
  logoUrl: string;
  language: string;
  currency: string;
  timezone: string;
  shippingFee: number | null;
  freeShippingThreshold: number | null;
  processingDays: string;
  carriers: string[];
  formats: string[];
  freePreviewLimit: number | null;
  deviceLimit: number | null;
  maxEbooksPerOrder: number | null;
}
export interface SystemSettings {
  id: string;
  revision: string | null;
  updatedBy: string | null;
  values: SettingsValues;
  paymentMethods: { id: string; name: string; description: string; configured: boolean | null }[];
  notice: string;
  storageOnly: boolean;
  unsupported: string[];
}
export function settingsError(error: HttpErrorResponse): string {
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Tài khoản chưa có quyền xem hoặc cập nhật Settings.';
  if (error.status === 0)
    return 'Không kết nối được API Settings. Kiểm tra backend và cổng Admin 4201.';
  if (error.status === 404)
    return 'API Settings chưa được đăng ký. Cần cập nhật và khởi động lại backend.';
  return error.error?.message || 'Không tải hoặc lưu được cấu hình. Vui lòng thử lại.';
}
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private auth = inject(AdminAuthService);
  private url = `${environment.apiUrl}/admin/settings`;
  get() {
    return this.auth
      .withSession(() => this.http.get<SystemSettings>(this.url, { withCredentials: true }))
      .pipe(timeout(15000));
  }
  save(changes: Partial<SettingsValues>, revision: string | null) {
    return this.auth
      .withSession((csrf) =>
        this.http.patch<SystemSettings>(
          this.url,
          { changes, revision },
          { withCredentials: true, headers: { 'X-Admin-CSRF': csrf } },
        ),
      )
      .pipe(timeout(15000));
  }
}
