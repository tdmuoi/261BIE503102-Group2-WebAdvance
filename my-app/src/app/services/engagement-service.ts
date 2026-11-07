import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * my-server chưa có API ghi cho theo dõi tác giả và giữ chỗ sự kiện.
 * Backend thêm endpoint thì điền đường dẫn vào đây, không cần sửa chỗ khác.
 */
const ENDPOINTS: { followAuthor: string | null; reserveEvent: string | null; newsletter: string | null } = {
  followAuthor: null, // ví dụ `${environment.apiUrl}/author-follows` (import environment từ ../../environments/environment)
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

  followAuthor(authorId: string): Observable<unknown> {
    return this.post(ENDPOINTS.followAuthor, { authorId });
  }

  reserveEvent(reservation: EventReservation): Observable<unknown> {
    return this.post(ENDPOINTS.reserveEvent, reservation);
  }

  subscribeNewsletter(email: string, topic: NewsletterTopic): Observable<unknown> {
    return this.post(ENDPOINTS.newsletter, { email, topic });
  }

  private post(url: string | null, body: object): Observable<unknown> {
    if (!url) return throwError(() => new EngagementUnavailableError());
    return this.http.post(url, body);
  }
}
