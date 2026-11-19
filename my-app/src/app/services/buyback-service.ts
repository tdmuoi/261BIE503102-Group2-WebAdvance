import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { BuybackRequest, BuybackResult } from '../models/buyback';
import { AuthService } from './auth-service';

@Injectable({ providedIn: 'root' })
export class BuybackService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/buyback-requests`;

  submitRequest(request: BuybackRequest, idempotencyKey: string): Observable<BuybackResult> {
    const token = this.auth.token;
    let headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return this.http.post<BuybackResult>(this.baseUrl, request, { headers });
  }
}
