import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Book } from '../models/book';

export interface BookQuery {
  /** Số sách tối đa (server giới hạn 200) */
  limit?: number;
  /** newest: mới tạo trước, updated: mới cập nhật trước */
  sort?: 'newest' | 'updated';
  /** Chỉ lấy sách đang giảm giá */
  discounted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/books`;

  getBooks(query: BookQuery = {}): Observable<Book[]> {
    let params = new HttpParams();
    if (query.limit) params = params.set('limit', query.limit);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.discounted) params = params.set('discounted', 'true');
    return this.http.get<Book[]>(this.baseUrl, { params });
  }
}
