import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth-service';

/**
 * my-server chưa có API giữ chỗ sự kiện: backend thêm endpoint thì điền đường dẫn vào đây.
 * Theo dõi tác giả: /api/account/followed-authors (cần đăng nhập, xem my-server/routes/customer-follows.js).
 */
const ENDPOINTS: { reserveEvent: string | null; newsletter: string | null } = {
  reserveEvent: null, // ví dụ `${environment.apiUrl}/event-registrations`
  newsletter: `${environment.apiUrl}/newsletter`,
};

/** Lỗi khi API chưa sẵn sàng — trang hiện thông báo riêng cho trường hợp này */
export class EngagementUnavailableError extends Error {
  constructor() {
    super('Engagement API is not available yet');
  }
}

export interface EventReservation {
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  seats: number;
}

/** POST /api/newsletter trả 409: email đã đăng ký */
export const NEWSLETTER_DUPLICATE_STATUS = 409;

/** Nhận bản tin: lịch sự kiện hoặc thư Lightbook News */
export type NewsletterTopic = 'events' | 'news';

@Injectable({ providedIn: 'root' })
export class EngagementService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly followUrl = `${environment.apiUrl}/account/followed-authors`;

  /** id các tác giả khách đang theo dõi */
  getFollowedAuthors(): Observable<string[]> {
    return this.http.get<string[]>(this.followUrl, { headers: this.authHeaders() });
  }

  followAuthor(authorId: string): Observable<unknown> {
    return this.http.put(`${this.followUrl}/${encodeURIComponent(authorId)}`, {}, { headers: this.authHeaders() });
  }

  unfollowAuthor(authorId: string): Observable<unknown> {
    return this.http.delete(`${this.followUrl}/${encodeURIComponent(authorId)}`, { headers: this.authHeaders() });
  }

  reserveEvent(reservation: EventReservation): Observable<unknown> {
    return this.post(ENDPOINTS.reserveEvent, reservation);
  }

  subscribeNewsletter(email: string, topic: NewsletterTopic): Observable<unknown> {
    return this.post(ENDPOINTS.newsletter, { email, topic });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private post(url: string | null, body: object): Observable<unknown> {
    if (!url) return throwError(() => new EngagementUnavailableError());
    return this.http.post(url, body);
  }
}
