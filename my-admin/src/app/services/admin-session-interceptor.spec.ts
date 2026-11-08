import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AdminAuthService } from './admin-auth-service';
import { adminSessionInterceptor } from './admin-session-interceptor';
import { environment } from '../../environments/environment';

describe('Expired Admin resource sessions', () => {
  let http: HttpTestingController;
  let auth: AdminAuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), provideHttpClient(withInterceptors([adminSessionInterceptor])),
      provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AdminAuthService);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.checkSession().subscribe();
    http.expectOne(environment.apiUrl + '/admin/auth/session').flush({
      user: { _id: 'fixture', role: 'superadmin' }, csrfToken: 'csrf', expiresAt: '2099-01-01',
    });
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });
  it('clears identity and redirects a direct resource GET on 401 while preserving its error', () => {
    let status: number | undefined;
    const url = environment.apiUrl + '/admin/books';
    TestBed.inject(HttpClient).get(url).subscribe({ error: (error) => status = error.status });
    http.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(auth.user).toBeNull();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
  });
  it('retains identity and the current route when a permission is denied', () => {
    const url = environment.apiUrl + '/admin/books';
    TestBed.inject(HttpClient).get(url).subscribe({ error: () => {} });
    http.expectOne(url).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.user?._id).toBe('fixture');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
  it('does not redirect failed login requests or public APIs', () => {
    for (const url of [environment.apiUrl + '/admin/auth/login', environment.apiUrl + '/books']) {
      TestBed.inject(HttpClient).get(url).subscribe({ error: () => {} });
      http.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' });
    }
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
});
