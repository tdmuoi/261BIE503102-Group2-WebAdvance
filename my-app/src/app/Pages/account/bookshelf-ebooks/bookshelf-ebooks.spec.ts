import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';

import { resetMockOrders } from '../orders/orders.mock';
import { BookshelfEbooks } from './bookshelf-ebooks';
import { lastReadLabel, readLabel } from './bookshelf.mock';

describe('BookshelfEbooks', () => {
  let fixture: ComponentFixture<BookshelfEbooks>;
  let component: BookshelfEbooks;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    resetMockOrders();
    await TestBed.configureTestingModule({
      declarations: [BookshelfEbooks],
      imports: [RouterModule],
      providers: [provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(BookshelfEbooks);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    vi.useFakeTimers();
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('khối "Đang đọc" là cuốn đọc gần nhất (Kitchen 42%)', () => {
    expect(component.current()?.title).toBe('Kitchen');
    expect(el.querySelector('.continue')?.textContent).toContain('Trang 58 / 140 · đọc lần cuối 2 giờ trước');
  });

  it('lọc theo trạng thái đọc và tìm kiếm', () => {
    expect(component.visible().length).toBe(6);
    component.filter.set('unread');
    expect(component.visible().map((e) => e.title)).toEqual(['Những Miền Linh Dị', 'The Roman']);
    component.filter.set('all');
    component.query.set('osho');
    expect(component.visible().map((e) => e.title)).toEqual(['Yêu – Being in Love']);
  });

  it('nhãn nút đọc và thời gian đọc', () => {
    expect([readLabel(0), readLabel(42), readLabel(100)]).toEqual(['Đọc ngay', 'Đọc tiếp', 'Đọc lại']);
    expect(lastReadLabel(null)).toBe('chưa đọc');
  });
});
