import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAuthService } from './admin-auth-service';
import { BookService } from './book-service';
import { OrderService } from './order-service';
import { ReturnService } from './return-service';
import { BannerService } from './banner-service';
import { DashboardService } from './dashboard-service';
import { BookPayload } from '../models/book';
import { BannerPayload } from '../models/banner';

describe('Admin resource authentication', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends session cookies on all five resource reads without exposing CSRF in the URL', () => {
    TestBed.inject(BookService).getBooks().subscribe();
    TestBed.inject(BookService).getInventory().subscribe();
    TestBed.inject(OrderService).getOrders().subscribe();
    TestBed.inject(ReturnService).getReturns().subscribe();
    TestBed.inject(BannerService).getBanners().subscribe();
    TestBed.inject(DashboardService).getDashboard().subscribe();
    const requests = http.match(r => r.url.includes('/admin/'));
    expect(requests.length).toBe(6);
    for (const req of requests) {
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.params.has('csrfToken')).toBe(false);
      req.flush({});
    }
  });

  it('waits for the session and attaches cookie plus CSRF to every write method', () => {
    TestBed.inject(BookService).createBook({} as BookPayload).subscribe();
    http.expectNone(r => r.method === 'POST');
    http.expectOne(r => r.url.endsWith('/auth/session')).flush({
      user: {}, csrfToken: 'verified-token', expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    TestBed.inject(BookService).updateBook('b', {} as BookPayload).subscribe();
    TestBed.inject(BookService).deleteBook('b').subscribe();
    TestBed.inject(BookService).bulk(['b'], 'hide').subscribe();
    TestBed.inject(OrderService).changeStatus('o', { status: 'confirmed' }).subscribe();
    TestBed.inject(OrderService).update('o', { adminNote: 'x' }).subscribe();
    TestBed.inject(ReturnService).changeStatus('r', { status: 'approved' }).subscribe();
    TestBed.inject(ReturnService).saveNote('r', 'x').subscribe();
    TestBed.inject(BannerService).createBanner({} as BannerPayload).subscribe();
    TestBed.inject(BannerService).updateBanner('b', {} as BannerPayload).subscribe();
    TestBed.inject(BannerService).setActive('b', false).subscribe();
    TestBed.inject(BannerService).reorder(['b']).subscribe();
    TestBed.inject(BannerService).deleteBanner('b').subscribe();
    const requests = http.match(r => r.method !== 'GET');
    expect(requests.length).toBe(13);
    for (const req of requests) {
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.get('X-Admin-CSRF')).toBe('verified-token');
      req.flush({});
    }
    expect(TestBed.inject(AdminAuthService)).toBeTruthy();
  });
});
