import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { AdminAuthService } from '../../services/admin-auth-service';
import { environment } from '../../../environments/environment';
import { timeout, TimeoutError } from 'rxjs';
export interface NewsArticle {
  _id?: string;
  id?: string;
  title: string;
  desc: string;
  content: string;
  contentFormat?: string | null;
  category: string;
  cover: string;
  img?: string;
  preserveCover?: boolean;
  slug: string;
  metaDescription: string;
  tags: string[];
  status: string;
  views?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  author?: { name: string; role?: string };
}
export function newsPayload(article: NewsArticle) {
  const {
    title,
    desc,
    content,
    category,
    slug,
    metaDescription,
    tags,
    status,
    updatedAt,
    publishedAt,
  } = article;
  return {
    title,
    desc,
    content,
    category,
    slug,
    metaDescription,
    tags,
    status,
    updatedAt,
    publishedAt,
    ...(!article.preserveCover ? { cover: article.cover } : {}),
  };
}
export interface NewsPage {
  items: NewsArticle[];
  total: number;
  categories: string[];
  stats: {
    total: number;
    draft: number;
    published: number;
    scheduled: number;
    hidden: number;
    views: number;
  };
}
export function newsError(error: HttpErrorResponse | TimeoutError): string {
  if (error instanceof TimeoutError)
    return 'API News phản hồi quá lâu. Hãy tải lại để kiểm tra trước khi thử lưu tiếp.';
  if (error.status === 0)
    return 'Không kết nối được API News. Kiểm tra backend và cổng Admin 4201.';
  if (error.status === 404)
    return 'Không tìm thấy bài viết hoặc API News chưa được nạp. Hãy kiểm tra và khởi động lại backend.';
  if (error.status === 413)
    return 'Nội dung vượt giới hạn gửi của server (100 KB). Hãy rút gọn nội dung và dùng URL ảnh.';
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Bạn chưa có quyền thực hiện thao tác News này.';
  return error.error?.message || 'Không kết nối được API News. Vui lòng thử lại.';
}
@Injectable({ providedIn: 'root' })
export class NewsService {
  private http = inject(HttpClient);
  private auth = inject(AdminAuthService);
  private url = `${environment.apiUrl}/admin/news`;
  list(
    query: {
      search?: string;
      category?: string;
      status?: string;
      limit?: number;
      skip?: number;
    } = {},
  ) {
    const params = new HttpParams({ fromObject: { ...query } });
    return this.auth
      .withSession(() => this.http.get<NewsPage>(this.url, { params, withCredentials: true }))
      .pipe(timeout(15000));
  }
  get(id: string) {
    return this.auth
      .withSession(() =>
        this.http.get<NewsArticle>(`${this.url}/${encodeURIComponent(id)}`, {
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }
  save(article: NewsArticle) {
    const payload = newsPayload(article);
    return this.auth
      .withSession((csrf) => {
        const options = { withCredentials: true, headers: { 'X-Admin-CSRF': csrf } };
        return article._id
          ? this.http.put<NewsArticle>(
              `${this.url}/${encodeURIComponent(article._id)}`,
              payload,
              options,
            )
          : this.http.post<NewsArticle>(this.url, payload, options);
      })
      .pipe(timeout(15000));
  }
}
