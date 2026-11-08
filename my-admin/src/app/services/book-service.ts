import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminAuthService } from './admin-auth-service';
import { environment } from '../../environments/environment';
import { AdminBook, Author, BookListResponse, BookPayload, BookQuery, Category } from '../models/book';

/** Gọi API Quản lý sách — my-server/routes/admin-books.js */
@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/books`;

  getBooks(query: BookQuery = {}): Observable<BookListResponse> {
    return this.listBooks(this.baseUrl, query);
  }

  getInventory(query: BookQuery = {}): Observable<BookListResponse> {
    return this.listBooks(`${this.baseUrl}/inventory`, query);
  }

  private listBooks(url: string, query: BookQuery): Observable<BookListResponse> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
    });
    return this.http.get<BookListResponse>(url, { params, withCredentials: true });
  }

  getBook(id: string): Observable<AdminBook> {
    return this.http.get<AdminBook>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  createBook(data: BookPayload): Observable<AdminBook> {
    return this.auth.withSession((csrfToken) => this.http.post<AdminBook>(this.baseUrl, data, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  updateBook(id: string, data: BookPayload): Observable<AdminBook> {
    return this.auth.withSession((csrfToken) => this.http.put<AdminBook>(`${this.baseUrl}/${id}`, data, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  /** Xoá mềm: sách chuyển sang status "deleted", web khách và admin không thấy nữa */
  deleteBook(id: string): Observable<{ deleted: boolean }> {
    return this.auth.withSession((csrfToken) => this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/${id}`, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  /** Ẩn / hiện / xoá nhiều sách cùng lúc */
  bulk(ids: string[], action: 'hide' | 'show' | 'delete'): Observable<{ modified: number }> {
    return this.auth.withSession((csrfToken) => this.http.patch<{ modified: number }>(`${this.baseUrl}/bulk`, { ids, action }, { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } }));
  }

  // Danh sách chọn trong form & bộ lọc (API dùng chung với web khách)
  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${environment.apiUrl}/categories`);
  }

  getAuthors(): Observable<Author[]> {
    return this.http.get<Author[]>(`${environment.apiUrl}/authors`);
  }
}
