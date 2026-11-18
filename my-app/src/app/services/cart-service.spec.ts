import { TestBed } from '@angular/core/testing';

import { makeBook } from '../testing/mock-books';
import { CartService } from './cart-service';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth-service';
import { environment } from '../../environments/environment';

describe('CartService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

  it('cộng dồn số lượng khi thêm cùng một sách', () => {
    const cart = TestBed.inject(CartService);
    const book = makeBook({ _id: 'b1' });

    cart.add(book, 2);
    cart.add(book, 1);
    cart.add(makeBook({ _id: 'b2' }), 1);

    expect(cart.quantityOf('b1')).toBe(3);
    expect(cart.count()).toBe(4);
  });

  it('lưu vào localStorage để tải lại trang vẫn còn', () => {
    TestBed.inject(CartService).add(makeBook({ _id: 'b1' }), 2);

    const saved = JSON.parse(localStorage.getItem('lightbook.cart') ?? '[]');
    expect(saved).toEqual([expect.objectContaining({ bookId: 'b1', quantity: 2 })]);
  });

  it('tải giỏ theo token, ghi tuần tự và giữ lần sửa mới khi request cũ trả về', () => {
    const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
    auth.setSession({ token: 'a'.repeat(64), user: { _id: 'user-a', fullName: 'A', email: 'a@example.invalid' } }, true);
    const cart = TestBed.inject(CartService); TestBed.tick();
    const get = http.expectOne(`${environment.apiUrl}/cart`);
    expect(get.request.headers.get('Authorization')).toBe(`Bearer ${'a'.repeat(64)}`);
    get.flush({ revision: null, items: [] });
    const book = makeBook({ _id: '000000000000000000000001' });
    cart.add(book, 1);
    const first = http.expectOne(`${environment.apiUrl}/cart`);
    cart.add(book, 2);
    http.expectNone(`${environment.apiUrl}/cart`);
    first.flush({ revision: 1, items: [{ bookId: book._id, title: book.title, image: '', price: 10, quantity: 1 }] });
    expect(cart.count()).toBe(3);
    const second = http.expectOne(`${environment.apiUrl}/cart`);
    expect(second.request.body).toEqual({ revision: 1, items: [{ bookId: book._id, quantity: 3 }] });
    second.flush({ revision: 2, items: [{ bookId: book._id, title: book.title, image: '', price: 10, quantity: 3 }] });
    expect(cart.syncStatus()).toBe('ready');
    expect(JSON.parse(localStorage.getItem('lightbook.cart.user:user-a')!)[0].quantity).toBe(3);
  });

  it('đổi tài khoản hủy request cũ và không mang giỏ riêng sang người tiếp theo', () => {
    const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
    auth.setSession({ token: 'a'.repeat(64), user: { _id: 'user-a', fullName: 'A', email: 'a@example.invalid' } }, true);
    const cart = TestBed.inject(CartService); TestBed.tick();
    http.expectOne(`${environment.apiUrl}/cart`).flush({ revision: null, items: [] });
    cart.add(makeBook({ _id: '000000000000000000000001' }), 1);
    const old = http.expectOne(`${environment.apiUrl}/cart`);
    auth.setSession({ token: 'b'.repeat(64), user: { _id: 'user-b', fullName: 'B', email: 'b@example.invalid' } }, true);
    TestBed.tick(); expect(old.cancelled).toBe(true);
    expect(cart.items()).toEqual([]);
    http.expectOne(`${environment.apiUrl}/cart`).flush({ revision: null, items: [] });
    expect(cart.items()).toEqual([]);
  });

  it('lỗi tải giỏ không được ghi đè dữ liệu trên server', () => {
    const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
    auth.setSession({ token: 'a'.repeat(64), user: { _id: 'user-a', fullName: 'A', email: 'a@example.invalid' } }, true);
    const cart = TestBed.inject(CartService); TestBed.tick();
    http.expectOne(`${environment.apiUrl}/cart`).flush({}, { status: 503, statusText: 'Unavailable' });
    cart.add(makeBook({ _id: '000000000000000000000001' }), 1);
    http.expectNone(`${environment.apiUrl}/cart`); expect(cart.syncStatus()).toBe('error');
  });

  it('thêm sách khi đang tải không xóa sách chỉ có trên server', () => {
    const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
    auth.setSession({ token: 'a'.repeat(64), user: { _id: 'user-a', fullName: 'A', email: 'a@example.invalid' } }, true);
    const cart = TestBed.inject(CartService); TestBed.tick();
    const get = http.expectOne(`${environment.apiUrl}/cart`);
    const added = makeBook({ _id: '000000000000000000000001' });
    cart.add(added, 1);
    get.flush({ revision: 1, items: [{ bookId: '000000000000000000000002', title: 'Remote', image: '', price: 10, quantity: 2 }] });
    const put = http.expectOne(`${environment.apiUrl}/cart`);
    expect(put.request.body.items).toHaveLength(2);
    put.flush({ revision: 2, items: cart.items() });
    expect(cart.count()).toBe(3);
  });

  it('sau tải lại trang vẫn giữ giỏ chưa đồng bộ khi server đã có phiên bản mới', () => {
    const cached = [{ bookId: '000000000000000000000001', title: 'Local', image: '', price: 10, quantity: 3 }];
    localStorage.setItem('lightbook.cart.user:user-a', JSON.stringify(cached));
    localStorage.setItem('lightbook.cart.user:user-a.pending', JSON.stringify({ revision: 1 }));
    const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
    auth.setSession({ token: 'a'.repeat(64), user: { _id: 'user-a', fullName: 'A', email: 'a@example.invalid' } }, true);
    const cart = TestBed.inject(CartService); TestBed.tick();
    http.expectOne(`${environment.apiUrl}/cart`).flush({ revision: 2, items: [] });
    expect(cart.items()).toEqual(cached); expect(cart.syncStatus()).toBe('error');
    http.expectNone(`${environment.apiUrl}/cart`);
  });
});
