import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { VndPipe } from '../../../pipes/vnd-pipe';
import { BookService } from '../../../services/book-service';
import { CartService } from '../../../services/cart-service';
import { WishlistService } from '../../../services/wishlist-service';
import { FakeDb, fakeCustomerApi, signInForTest } from '../../../testing/fake-customer-api';
import { Wishlist } from './wishlist';

describe('Wishlist', () => {
  let fixture: ComponentFixture<Wishlist>;
  let component: Wishlist;
  let el: HTMLElement;
  let db: FakeDb;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    signInForTest();
    const api = fakeCustomerApi();
    db = api.db;
    const w = (bookId: string, price: number, originalPrice: number) => ({ bookId, title: `Sách ${bookId}`, image: '', price, originalPrice, author: 'Tác giả', addedAt: '2026-10-01T00:00:00Z' });
    db.wishlist = [w('a', 79000, 99000), w('b', 135000, 135000), w('c', 192000, 240000), w('d', 98000, 98000), w('e', 115000, 115000)];
    await TestBed.configureTestingModule({
      declarations: [Wishlist, VndPipe],
      imports: [RouterModule],
      providers: [provideRouter([]), api.providers, { provide: BookService, useValue: { getCatalog: () => of({ books: [], authors: [], categories: [] }) } }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Wishlist);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('lấy wishlist của tài khoản từ server: 5 cuốn, 2 cuốn đang giảm giá', () => {
    expect(component.cards().length).toBe(5);
    expect(el.querySelector('.bar')?.textContent).toContain('5 cuốn trong wishlist');
    expect(el.querySelector('.bar')?.textContent).toContain('2 cuốn đang giảm giá');
    expect(el.textContent).toContain('Đang giảm 20%');
  });

  it('bỏ tim thì xoá trên server; Thêm tất cả vào giỏ', () => {
    const first = component.cards()[0];
    component.remove(first);
    expect(TestBed.inject(WishlistService).has(first.bookId)).toBe(false);
    vi.advanceTimersByTime(400);
    expect(db.calls).toContain(`DELETE /wishlist/${first.bookId}`);
    expect(db.wishlist.length).toBe(4);
    component.addAll();
    expect(TestBed.inject(CartService).items().length).toBe(4);
  });
});
