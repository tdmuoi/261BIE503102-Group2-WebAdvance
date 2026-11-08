import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminAuthService } from './admin-auth-service';

/** Handles direct resource reads as well as requests wrapped in withSession. */
export const adminSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const injector = inject(Injector);
  const prefix = `${environment.apiUrl}/admin/`;
  return next(request).pipe(catchError((error: unknown) => {
    if (request.url.startsWith(prefix) && !request.url.startsWith(`${prefix}auth/`) &&
        error instanceof HttpErrorResponse && error.status === 401) {
      injector.get(AdminAuthService).expireSession();
      const router = injector.get(Router);
      if (!router.url.startsWith('/login')) void router.navigate(['/login']);
    }
    return throwError(() => error);
  }));
};
