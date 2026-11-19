import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth-service';

const ENDPOINTS: { reserveEvent: string | null; newsletter: string | null } = {
  reserveEvent: `${environment.apiUrl}/event-registrations`,
  newsletter: `${environment.apiUrl}/newsletter`,
};

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

export const NEWSLETTER_DUPLICATE_STATUS = 409;

export type NewsletterTopic = 'events' | 'news';

@Injectable({ providedIn: 'root' })
export class EngagementService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly followUrl = `${environment.apiUrl}/account/followed-authors`;

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
