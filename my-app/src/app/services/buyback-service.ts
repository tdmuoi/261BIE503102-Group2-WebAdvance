import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { BuybackRequest, BuybackResult } from '../models/buyback';
import { AuthService } from './auth-service';

/**
 * Phiếu thanh lý sách — POST /api/buyback-requests (cần đăng nhập).
 * Ảnh sách tải lên Cloudinary trước (UploadService), phiếu chỉ gửi kèm đường link ảnh.
 * Khách theo dõi phiếu ở Tài khoản › Quản lý đơn hàng › Thanh lý (GET /api/account/buybacks).
 */
@Injectable({ providedIn: 'root' })
export class BuybackService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/buyback-requests`;

  /**
   * `idempotencyKey`: cố định cho một lần điền phiếu, bấm gửi lại (mạng chập chờn)
   * thì server trả về đúng phiếu cũ thay vì tạo phiếu trùng.
   */
  submitRequest(request: BuybackRequest, idempotencyKey: string): Observable<BuybackResult> {
    const token = this.auth.token;
    let headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return this.http.post<BuybackResult>(this.baseUrl, request, { headers });
  }
}
