import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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

/** API contract required from my-server; these routes are not present yet. */
@Injectable({ providedIn: 'root' })
export class AccountManagementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/accounts`;

  getCustomers(query: AccountQuery): Observable<CustomerList> {
    return this.http.get<CustomerList>(`${this.baseUrl}/customers`, { params: this.params(query) });
  }

  getCustomer(id: string): Observable<CustomerAccountDetail> {
    return this.http.get<CustomerAccountDetail>(`${this.baseUrl}/customers/${encodeURIComponent(id)}`);
  }

  exportCustomers(query: Pick<AccountQuery, 'q' | 'tier' | 'status'>): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/customers/export`, { params: this.params({ ...query, page: 1, limit: 1 }), responseType: 'blob' });
  }

  customerAction(id: string, action: 'send-email' | 'reset-password' | 'lock' | 'unlock'): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/customers/${encodeURIComponent(id)}/actions`, { action });
  }

  getAdmins(query: AccountQuery): Observable<AdminList> {
    return this.http.get<AdminList>(`${this.baseUrl}/admins`, { params: this.params(query) });
  }

  createAdmin(body: AdminAccountRequest): Observable<AdminAccount> {
    return this.http.post<AdminAccount>(`${this.baseUrl}/admins`, body);
  }

  updateAdmin(id: string, body: Partial<AdminAccountRequest> & { status?: string }): Observable<AdminAccount> {
    return this.http.patch<AdminAccount>(`${this.baseUrl}/admins/${encodeURIComponent(id)}`, body);
  }

  deleteAdmin(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/admins/${encodeURIComponent(id)}`);
  }

  createRole(body: CreateRoleRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/roles`, body);
  }

  updateRolePermissions(roleId: string, permissionIds: string[]): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/roles/${encodeURIComponent(roleId)}/permissions`, { permissionIds });
  }

  updateSecurity(body: { requireTwoFactor: boolean; forcePasswordRotation: boolean; restrictOfficeIp: boolean }): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/security`, body);
  }

  private params(query: AccountQuery): HttpParams {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
    });
    return params;
  }
}