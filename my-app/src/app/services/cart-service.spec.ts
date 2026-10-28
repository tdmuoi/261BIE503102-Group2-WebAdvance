import { TestBed } from '@angular/core/testing';

import { makeBook } from '../testing/mock-books';
import { CartService } from './cart-service';

describe('CartService', () => {
  beforeEach(() => localStorage.clear());

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
});
