import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { adminApiError } from './admin-api-error';

describe('Admin API errors', () => {
  it('does not mistake CORS/network failures for a confirmed stopped server', () => {
    expect(adminApiError(new HttpErrorResponse({ status: 0 }))).toContain('CORS');
  });
  it('distinguishes expired authentication, authorization and server errors', () => {
    expect(adminApiError(new HttpErrorResponse({ status: 401 }))).toContain('đăng nhập');
    expect(adminApiError(new HttpErrorResponse({ status: 403 }))).toContain('CSRF');
    expect(adminApiError(new HttpErrorResponse({ status: 503 }))).toContain('503');
  });
  it('uses the actual Retry-After value rather than always claiming fifteen minutes', () => {
    expect(adminApiError(new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '42' }) }))).toContain('42 giây');
  });
});
