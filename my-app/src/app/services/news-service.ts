import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { NewsItem, NewsPage } from '../models/content';

export interface NewsQuery {
  category?: string;
  search?: string;
  limit?: number;
  skip?: number;
}

/** Bài viết đã đăng — GET /api/news, GET /api/news/:id (chỉ đọc) */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/news`;

  getNews(query: NewsQuery = {}): Observable<NewsPage> {
    let params = new HttpParams();
    if (query.category) params = params.set('category', query.category);
    if (query.search) params = params.set('search', query.search);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.skip) params = params.set('skip', query.skip);
    return this.http.get<NewsPage>(this.baseUrl, { params });
  }

  getArticle(id: string): Observable<NewsItem> {
    return this.http.get<NewsItem>(`${this.baseUrl}/${encodeURIComponent(id)}`);
  }
}
