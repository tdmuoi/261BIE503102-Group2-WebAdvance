import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth-service';
import { WishlistService } from './wishlist-service';
import { fakeCustomerApi, signInForTest } from '../testing/fake-customer-api';

describe('WishlistService', () => {
  const book = { _id: 'b1', title: 'Kitchen', image: 'k.jpg', price: 87000 };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('chưa đăng nhập: thêm / bỏ / toggle lưu localStorage', () => {
    TestBed.configureTestingModule({ providers: [fakeCustomerApi().providers] });
    const service = TestBed.inject(WishlistService);
    TestBed.tick();
    expect(service.toggle(book)).toBe(true);
    expect(service.has('b1')).toBe(true);
    expect(JSON.parse(localStorage.getItem('lightbook.wishlist')!)[0].bookId).toBe('b1');
    expect(service.toggle(book)).toBe(false);
    expect(service.count()).toBe(0);
  });

  it('đăng nhập: gộp wishlist khách lên tài khoản, lưu trên server; đăng xuất thì không còn thấy', () => {
    localStorage.setItem('lightbook.wishlist', JSON.stringify([{ bookId: 'g1', title: 'Guest', image: '', price: 1, addedAt: null }, { bookId: 'mock-ove', title: 'Mẫu cũ', image: '', price: 1, addedAt: null }]));
    signInForTest();
    const api = fakeCustomerApi(0);
    TestBed.configureTestingModule({ providers: [api.providers] });
    const service = TestBed.inject(WishlistService);
    TestBed.tick();
    vi.advanceTimersByTime(10);
    expect(api.db.calls).toEqual(['POST /wishlist/g1', 'GET /wishlist']);
    expect(service.items().map((i) => i.bookId)).toEqual(['g1']);
    expect(localStorage.getItem('lightbook.wishlist')).toBeNull();

    service.add(book);
    vi.advanceTimersByTime(10);
    expect(api.db.wishlist.map((w) => w.bookId)).toEqual(['b1', 'g1']);

    TestBed.inject(AuthService).logout();
    TestBed.tick();
    expect(service.count()).toBe(0);
  });
});
