import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BookList } from '../Pages/books/book-list/book-list';
import { Orders } from '../Pages/orders/orders';
import { Refunds } from '../Pages/refunds/refunds';
import { Banners } from '../Pages/banners/banners';

describe('Admin tables keep only the latest filter response', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [
    provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
  ] }));
  for (const [Component, endpoint] of [[BookList, 'books'], [Orders, 'orders'],
    [Refunds, 'returns'], [Banners, 'banners']] as const) {
    it(`${endpoint}: cancels old reads, clears rejected data and cancels on destroy`, () => {
      const http = TestBed.inject(HttpTestingController);
      const component = TestBed.runInInjectionContext(() => new Component());
      if (endpoint === 'books') http.expectOne((r) => r.url.endsWith('/categories')).flush([]);
      const first = http.expectOne((r) => r.url.endsWith('/admin/' + endpoint));
      component.load();
      expect(first.cancelled).toBe(true);
      const current = http.expectOne((r) => r.url.endsWith('/admin/' + endpoint));
      current.flush({ items: [], total: 0, counts: {}, positions: [] });
      expect(component.loading()).toBe(false);
      component.load();
      http.expectOne((r) => r.url.endsWith('/admin/' + endpoint))
        .flush({}, { status: 403, statusText: 'Forbidden' });
      expect(component.data()).toBeNull();
      expect(component.error()).toContain('quyền');
      component.load();
      const last = http.expectOne((r) => r.url.endsWith('/admin/' + endpoint));
      component.ngOnDestroy();
      expect(last.cancelled).toBe(true);
      http.verify();
    });
  }
});
