import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from '../../services/admin-auth-service';

export interface EventInput {
  title: string; description: string; status: 'draft' | 'published' | 'hidden';
  startAt: string | null; endAt: string | null; authorId: string | null; guests: string[];
  location: string; format: 'online' | 'offline'; type: string; image: string; capacity: number | null;
}
export interface AdminEvent extends EventInput {
  _id: string; eventCode: string; registeredCount: number; isDemo: boolean; revision: string | null;
}
export interface EventPage { items: AdminEvent[]; total: number; page: number; limit: number; }

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly url = `${environment.apiUrl}/admin/events`;
  list(page: number, status: string, search: string) {
    return this.auth.withSession(() => this.http.get<EventPage>(this.url, {
      params: { page, status, search }, withCredentials: true,
    }));
  }
  save(body: EventInput, existing: AdminEvent | null) {
    return this.auth.withSession(csrf => {
      const options = { withCredentials: true, headers: { 'X-Admin-CSRF': csrf } };
      return existing ? this.http.put<AdminEvent>(`${this.url}/${existing._id}`, { ...body, revision: existing.revision }, options)
        : this.http.post<AdminEvent>(this.url, body, options);
    });
  }
}
