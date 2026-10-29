import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { BookService } from '../../../services/book-service';
import { resetMockOrders } from '../orders/orders.mock';
import { BookshelfPurchased } from './bookshelf-purchased';

describe('BookshelfPurchased', () => {
  let fixture: ComponentFixture<BookshelfPurchased>;
  let component: BookshelfPurchased;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    resetMockOrders();
    await TestBed.configureTestingModule({
      declarations: [BookshelfPurchased],
      imports: [RouterModule],
      providers: [provideRouter([]), { provide: BookService, useValue: { getCatalog: () => of({ books: [], authors: [], categories: [] }) } }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(BookshelfPurchased);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    vi.useFakeTimers();
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('liệt kê sách trong đơn đã xác nhận, mới nhất trước — giống Figma', () => {
    expect(component.visible().map((b) => b.title)).toEqual([
      'Người Đàn Ông Mang Tên Ove', 'Kitchen', 'Yêu – Being in Love', 'Lũ Trẻ Hư Nhất Quả Đất 3', 'Hồ Sơ Mật', 'The Roman',
    ]);
    expect(el.textContent).toContain('Mua ngày 18/10/2026 · Đơn #LB-24186');
    expect(el.textContent).toContain('Đã đánh giá ★ 5');
  });

  it('chip đếm theo loại và lọc', () => {
    expect(component.chips().map((c) => c.count)).toEqual([6, 2, 2, 2]);
    component.setKind('ebook');
    expect(component.visible().map((b) => b.title)).toEqual(['Yêu – Being in Love', 'Hồ Sơ Mật']);
  });

  it('sắp xếp cũ nhất trước', () => {
    component.sort.set('oldest');
    expect(component.visible()[0].title).toBe('The Roman');
  });
});
