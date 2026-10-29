import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { VndPipe } from '../../../pipes/vnd-pipe';
import { BookService } from '../../../services/book-service';
import { CartService } from '../../../services/cart-service';
import { WishlistService } from '../../../services/wishlist-service';
import { Wishlist } from './wishlist';

describe('Wishlist', () => {
  let fixture: ComponentFixture<Wishlist>;
  let component: Wishlist;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      declarations: [Wishlist, VndPipe],
      imports: [RouterModule],
      providers: [provideRouter([]), { provide: BookService, useValue: { getCatalog: () => of({ books: [], authors: [], categories: [] }) } }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Wishlist);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('lần đầu có 5 cuốn mẫu, 2 cuốn đang giảm giá — giống Figma', () => {
    fixture.detectChanges();
    expect(component.cards().length).toBe(5);
    expect(el.querySelector('.bar')?.textContent).toContain('5 cuốn trong wishlist');
    expect(el.querySelector('.bar')?.textContent).toContain('2 cuốn đang giảm giá');
    expect(el.textContent).toContain('Đang giảm 20%');
  });

  it('bỏ tim thì xoá khỏi wishlist; Thêm tất cả vào giỏ', () => {
    const first = component.cards()[0];
    component.remove(first);
    expect(TestBed.inject(WishlistService).has(first.bookId)).toBe(false);
    component.addAll();
    expect(TestBed.inject(CartService).items().length).toBe(4);
  });
});
