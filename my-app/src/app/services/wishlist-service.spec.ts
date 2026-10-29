import { TestBed } from '@angular/core/testing';

import { WishlistService } from './wishlist-service';

describe('WishlistService', () => {
  beforeEach(() => localStorage.clear());

  it('thêm / bỏ / toggle và lưu localStorage', () => {
    const service = TestBed.inject(WishlistService);
    const book = { _id: 'b1', title: 'Kitchen', image: 'k.jpg', price: 87000 };
    expect(service.toggle(book)).toBe(true);
    expect(service.has('b1')).toBe(true);
    expect(JSON.parse(localStorage.getItem('lightbook.wishlist')!)[0].bookId).toBe('b1');
    expect(service.toggle(book)).toBe(false);
    expect(service.count()).toBe(0);
  });
});
