import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { LbEvent } from '../models/content';

export interface EventQuery {
  when?: 'upcoming' | 'past';
  authorId?: string;
  limit?: number;
}

/** Sự kiện giao lưu đã đăng — GET /api/events (chỉ đọc) */
@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly http = inject(HttpClient);

  getEvents(query: EventQuery = {}): Observable<LbEvent[]> {
    let params = new HttpParams();
    if (query.when) params = params.set('when', query.when);
    if (query.authorId) params = params.set('authorId', query.authorId);
    if (query.limit) params = params.set('limit', query.limit);
    return this.http.get<LbEvent[]>(`${environment.apiUrl}/events`, { params });
  }
}
