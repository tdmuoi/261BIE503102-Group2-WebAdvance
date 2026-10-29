import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { Branch, BuybackRequest, BuybackResult } from '../models/buyback';

/**
 * my-server chưa có API thu mua sách và chi nhánh.
 * Backend thêm endpoint thì điền đường dẫn vào đây, không cần sửa chỗ khác.
 */
const ENDPOINTS: { submit: string | null; branches: string | null } = {
  submit: null, // ví dụ `${environment.apiUrl}/buyback-requests` (import environment từ ../../environments/environment)
  branches: null, // ví dụ `${environment.apiUrl}/branches`
};

/** Lỗi khi API chưa sẵn sàng — trang hiện thông báo riêng cho trường hợp này */
export class BuybackUnavailableError extends Error {
  constructor() {
    super('Buyback API is not available yet');
  }
}

@Injectable({ providedIn: 'root' })
export class BuybackService {
  private readonly http = inject(HttpClient);

  /** Chi nhánh nhận sách trực tiếp. Chưa có API thì trả danh sách rỗng */
  getBranches(): Observable<Branch[]> {
    if (!ENDPOINTS.branches) return of([]);
    return this.http.get<Branch[]>(ENDPOINTS.branches);
  }

  /** Gửi phiếu thanh lý: nội dung phiếu dạng JSON trong field "request", ảnh trong field "photos" */
  submitRequest(request: BuybackRequest, photos: File[]): Observable<BuybackResult> {
    if (!ENDPOINTS.submit) return throwError(() => new BuybackUnavailableError());

    const body = new FormData();
    body.append('request', JSON.stringify(request));
    photos.forEach((photo) => body.append('photos', photo, photo.name));
    return this.http.post<BuybackResult>(ENDPOINTS.submit, body);
  }
}
