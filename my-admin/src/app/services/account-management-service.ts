import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { AdminAuthService } from './admin-auth-service';

import { environment } from '../../environments/environment';
import {
  AccountQuery,
  AdminAccount,
  AdminAccountRequest,
  AdminList,
  CreateRoleRequest,
  CustomerAccountDetail,
  CustomerList,
} from '../models/account-management';

/** Cookie/CSRF protected API: my-server/routes/admin-accounts.js. */
@Injectable({ providedIn: 'root' })
export class AccountManagementService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly baseUrl = `${environment.apiUrl}/admin/accounts`;

  getCustomers(query: AccountQuery): Observable<CustomerList> {
    return this.auth
      .withSession(() =>
        this.http.get<CustomerList>(`${this.baseUrl}/customers`, {
          params: this.params(query),
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }

  getCustomer(id: string): Observable<CustomerAccountDetail> {
    return this.auth
      .withSession(() =>
        this.http.get<CustomerAccountDetail>(
          `${this.baseUrl}/customers/${encodeURIComponent(id)}`,
          {
            withCredentials: true,
          },
        ),
      )
      .pipe(timeout(15000));
  }

  exportCustomers(query: Pick<AccountQuery, 'q' | 'tier' | 'status'>): Observable<Blob> {
    return this.auth
      .withSession(() =>
        this.http.get(`${this.baseUrl}/customers/export`, {
          params: this.params({ ...query, page: 1, limit: 1 }),
          responseType: 'blob',
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }

  customerAction(
    id: string,
    action: 'send-email' | 'reset-password' | 'lock' | 'unlock',
  ): Observable<void> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.post<void>(
          `${this.baseUrl}/customers/${encodeURIComponent(id)}/actions`,
          { action },
          { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } },
        ),
      )
      .pipe(timeout(15000));
  }

  getAdmins(query: AccountQuery): Observable<AdminList> {
    return this.auth
      .withSession(() =>
        this.http.get<AdminList>(`${this.baseUrl}/admins`, {
          params: this.params(query),
          withCredentials: true,
        }),
      )
      .pipe(timeout(15000));
  }

  createAdmin(body: AdminAccountRequest): Observable<AdminAccount> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.post<AdminAccount>(`${this.baseUrl}/admins`, body, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }

  updateAdmin(
    id: string,
    body: Partial<AdminAccountRequest> & { status?: string },
  ): Observable<AdminAccount> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.patch<AdminAccount>(`${this.baseUrl}/admins/${encodeURIComponent(id)}`, body, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }

  deleteAdmin(id: string): Observable<void> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.delete<void>(`${this.baseUrl}/admins/${encodeURIComponent(id)}`, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }

  createRole(body: CreateRoleRequest): Observable<void> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.post<void>(`${this.baseUrl}/roles`, body, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }

  updateRolePermissions(roleId: string, permissionIds: string[]): Observable<void> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.put<void>(
          `${this.baseUrl}/roles/${encodeURIComponent(roleId)}/permissions`,
          { permissionIds },
          { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } },
        ),
      )
      .pipe(timeout(15000));
  }

  saveRoleActions(roleId: string, permissions: { module: string; actions: string[] }[], revision: string): Observable<{ revision: string }> {
    return this.auth.withSession((csrfToken) => this.http.put<{ revision: string }>(
      `${this.baseUrl}/roles/${encodeURIComponent(roleId)}/permissions`, { permissions, revision },
      { withCredentials: true, headers: { 'X-Admin-CSRF': csrfToken } },
    )).pipe(timeout(15000));
  }

  updateSecurity(body: {
    requireTwoFactor: boolean;
    forcePasswordRotation: boolean;
    restrictOfficeIp: boolean;
  }): Observable<void> {
    return this.auth
      .withSession((csrfToken) =>
        this.http.patch<void>(`${this.baseUrl}/security`, body, {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        }),
      )
      .pipe(timeout(15000));
  }

  private params(query: AccountQuery): HttpParams {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
    });
    return params;
  }
}
