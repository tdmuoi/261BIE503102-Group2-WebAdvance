import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestScheduler } from 'rxjs/testing';
import { TimeoutError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginBook, LoginBooksService } from './login-books-service';

describe('Login public Books service', () => {
  let service: LoginBooksService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LoginBooksService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function request() {
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/books`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('200');
    expect(req.request.params.get('sort')).toBe('newest');
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-Admin-CSRF')).toBe(false);
    http.expectNone((r) => r.url.includes('/admin/'));
    return req;
  }
  it('uses only the public catalogue and preserves API cover URLs', () => {
    let books: LoginBook[] = [];
    service.getBooks().subscribe((value) => books = value);
    const images = ['https://example.invalid/book.jpg', '/images/book.png', 'images/cover.webp',
      'data:image/png;base64,aGVsbG8='];
    request().flush(images.map((image, index) => ({ _id: String(index), title: 'Book', image })));
    expect(books.map((book) => book.image)).toEqual(images);
    expect(books.length).toBe(4); // Extra candidates remain available for broken-image replacement.
  });
  it('skips missing or unsafe covers, invalid documents and duplicate covers/books', () => {
    let books: LoginBook[] = [];
    service.getBooks().subscribe((value) => books = value);
    request().flush([
      null, {}, { _id: 'blank', title: 'Book', image: ' ' },
      { _id: 'unsafe', title: 'Book', image: 'javascript:alert(1)' },
      { _id: 'svg', title: 'Book', image: 'data:image/svg+xml;base64,aGVsbG8=' },
      { _id: 'credentials', title: 'Book', image: 'https://user:secret@example.invalid/a.png' },
      { _id: 'no-title', title: '', image: '/images/a.png' },
      { _id: 'valid', title: ' Book ', image: ' /images/a.png ' },
      { _id: 'valid', title: 'Duplicate ID', image: '/images/b.png' },
      { _id: 'duplicate-image', title: 'Duplicate image', image: '/images/a.png' },
    ]);
    expect(books).toEqual([{ _id: 'valid', title: 'Book', image: '/images/a.png' }]);
  });
  it('accepts an empty catalogue without inventing fallback books', () => {
    let books: LoginBook[] | undefined;
    service.getBooks().subscribe((value) => books = value);
    request().flush([]);
    expect(books).toEqual([]);
  });
  it('reports an unexpected API shape as a catalogue error', () => {
    let failed = false;
    service.getBooks().subscribe({ error: () => failed = true });
    request().flush({ items: [] });
    expect(failed).toBe(true);
  });
  it('limits a stalled catalogue request to ten seconds', () => {
    let error: unknown;
    new TestScheduler(() => {}).run(({ flush }) => {
      service.getBooks().subscribe({ error: (value) => error = value });
      const req = request();
      flush();
      expect(req.cancelled).toBe(true);
    });
    expect(error).toBeInstanceOf(TimeoutError);
  });
});
