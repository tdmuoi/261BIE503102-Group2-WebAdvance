import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  provideRouter,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { Observable } from 'rxjs';
import { AdminAuthService, adminAuthGuard } from './admin-auth-service';
import { environment } from '../../environments/environment';
const base = environment.apiUrl + '/admin/auth';
const session = {
  user: { _id: 'a', fullName: 'Admin', email: 'a@example.test', role: 'superadmin' as const },
  csrfToken: 'csrf',
  expiresAt: '2099-01-01T00:00:00Z',
};
describe('AdminAuthService and guard', () => {
  let service: AdminAuthService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AdminAuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('keeps credentials in an HttpOnly cookie flow and waits for the server before setting user state', () => {
    service
      .login({ email: 'a@example.test', password: 'test-password', rememberMe: false })
      .subscribe();
    const req = http.expectOne(base + '/login');
    expect(req.request.withCredentials).toBe(true);
    expect(service.user).toBeNull();
    req.flush(session);
    expect(service.user?._id).toBe('a');
  });
  it('refreshes the session to obtain a CSRF token before a protected request', () => {
    let token = '';
    service
      .withSession((csrf) => {
        token = csrf;
        return new Observable<void>((subscriber) => {
          subscriber.next();
          subscriber.complete();
        });
      })
      .subscribe();
    const req = http.expectOne(base + '/session');
    expect(req.request.withCredentials).toBe(true);
    expect(token).toBe('');
    req.flush(session);
    expect(token).toBe('csrf');
  });
  it('clears state on a confirmed 401', () => {
    service.checkSession().subscribe();
    http.expectOne(base + '/session').flush(session);
    service.checkSession().subscribe({ error: () => {} });
    http.expectOne(base + '/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(service.user).toBeNull();
  });
  it('keeps the session after a resource permission denial without hiding the error', () => {
    service.checkSession().subscribe();
    http.expectOne(base + '/session').flush(session);
    let status: number | undefined;
    service
      .withSession(() => TestBed.inject(HttpClient).get('/permission-test'))
      .subscribe({ error: (e) => (status = e.status) });
    http.expectOne('/permission-test').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
    expect(service.user?._id).toBe('a');
  });
  it('clears the session after a resource returns 401', () => {
    service.checkSession().subscribe();
    http.expectOne(base + '/session').flush(session);
    service
      .withSession(() => TestBed.inject(HttpClient).get('/permission-test'))
      .subscribe({ error: () => {} });
    http.expectOne('/permission-test').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(service.user).toBeNull();
  });
  it('still clears the session when the session endpoint itself returns 403', () => {
    service.checkSession().subscribe();
    http.expectOne(base + '/session').flush(session);
    service.checkSession().subscribe({ error: () => {} });
    http.expectOne(base + '/session').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(service.user).toBeNull();
  });
  it('sends logout with credentials and CSRF and does not clear a failed logout', () => {
    service.checkSession().subscribe();
    http.expectOne(base + '/session').flush(session);
    service.logout().subscribe({ error: () => {} });
    const req = http.expectOne(base + '/logout');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-Admin-CSRF')).toBe('csrf');
    req.error(new ProgressEvent('error'));
    expect(service.user?._id).toBe('a');
  });
  it('redirects an unauthenticated guard to Login', () => {
    let result: unknown;
    const guard = TestBed.runInInjectionContext(() =>
      adminAuthGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<unknown>;
    guard.subscribe((value) => (result = value));
    http.expectOne(base + '/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(
      TestBed.inject(Router).serializeUrl(result as Parameters<Router['serializeUrl']>[0]),
    ).toBe('/login');
  });
  it('allows a route only after an authenticated session response', () => {
    let result: unknown;
    const guard = TestBed.runInInjectionContext(() =>
      adminAuthGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<unknown>;
    guard.subscribe((value) => (result = value));
    expect(result).toBeUndefined();
    http.expectOne(base + '/session').flush(session);
    expect(result).toBe(true);
  });
});
