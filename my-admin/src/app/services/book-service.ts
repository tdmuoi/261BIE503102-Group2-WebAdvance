import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminBook, Author, BookListResponse, BookPayload, BookQuery, Category } from '../models/book';

/** Gọi API Quản lý sách — my-server/routes/admin-books.js */
@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/books`;

  getBooks(query: BookQuery = {}): Observable<BookListResponse> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
    });
    return this.http.get<BookListResponse>(this.baseUrl, { params });
  }

  getBook(id: string): Observable<AdminBook> {
    return this.http.get<AdminBook>(`${this.baseUrl}/${id}`);
  }

  createBook(data: BookPayload): Observable<AdminBook> {
    return this.http.post<AdminBook>(this.baseUrl, data);
  }

  updateBook(id: string, data: BookPayload): Observable<AdminBook> {
    return this.http.put<AdminBook>(`${this.baseUrl}/${id}`, data);
  }

  /** Xoá mềm: sách chuyển sang status "deleted", web khách và admin không thấy nữa */
  deleteBook(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/${id}`);
  }

  /** Ẩn / hiện / xoá nhiều sách cùng lúc */
  bulk(ids: string[], action: 'hide' | 'show' | 'delete'): Observable<{ modified: number }> {
    return this.http.patch<{ modified: number }>(`${this.baseUrl}/bulk`, { ids, action });
  }

  // Danh sách chọn trong form & bộ lọc (API dùng chung với web khách)
  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${environment.apiUrl}/categories`);
  }

  getAuthors(): Observable<Author[]> {
    return this.http.get<Author[]>(`${environment.apiUrl}/authors`);
  }
}
