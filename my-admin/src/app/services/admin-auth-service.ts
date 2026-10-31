import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminLoginRequest, AdminSession, AdminUser } from '../models/admin-auth';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/auth`;
  private readonly state = new BehaviorSubject<AdminSession | null>(null);
  readonly session$ = this.state.asObservable();
  get user(): AdminUser | null {
    return this.state.value?.user ?? null;
  }

  login(body: AdminLoginRequest): Observable<AdminSession> {
    return this.http
      .post<AdminSession>(`${this.baseUrl}/login`, body, { withCredentials: true })
      .pipe(tap((session) => this.state.next(session)));
  }
  checkSession(): Observable<AdminSession> {
    return this.http.get<AdminSession>(`${this.baseUrl}/session`, { withCredentials: true }).pipe(
      tap((session) => this.state.next(session)),
      catchError((error: unknown) => {
        this.clear();
        return throwError(() => error);
      }),
    );
  }
  /** The session ID stays in an HttpOnly cookie. Only CSRF/user state lives in memory. */
  withSession<T>(request: (csrfToken: string) => Observable<T>): Observable<T> {
    const current = this.state.value;
    const session =
      current && Date.parse(current.expiresAt) > Date.now() ? of(current) : this.checkSession();
    return session.pipe(
      switchMap((value) => request(value.csrfToken)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) this.clear();
        return throwError(() => error);
      }),
    );
  }
  logout(): Observable<void> {
    return this.withSession((csrfToken) =>
      this.http.post<void>(
        `${this.baseUrl}/logout`,
        {},
        {
          withCredentials: true,
          headers: { 'X-Admin-CSRF': csrfToken },
        },
      ),
    ).pipe(
      tap(() => this.clear()),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.clear();
          return of(undefined);
        }
        return throwError(() => error);
      }),
    );
  }
  private clear(): void {
    this.state.next(null);
  }
}

// Prepared here so no routing/module file is changed before group approval.
function checkAdminRoute() {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => true),
    catchError(() => of(router.parseUrl('/login'))),
  );
}
export const adminAuthGuard: CanActivateFn = () => checkAdminRoute();
export const adminAuthChildGuard: CanActivateChildFn = () => checkAdminRoute();
