import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { DashboardData } from '../models/dashboard';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/dashboard`;

  /** Số liệu tổng quan của N ngày gần nhất (tính cả hôm nay) */
  getDashboard(days = 7): Observable<DashboardData> {
    const params = new HttpParams().set('days', days);
    return this.http.get<DashboardData>(this.baseUrl, { params });
  }
}
