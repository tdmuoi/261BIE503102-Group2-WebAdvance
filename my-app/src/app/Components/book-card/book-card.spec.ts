import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../pipes/vnd-pipe';
import { TrimCover } from '../../directives/trim-cover';
import { makeBook } from '../../testing/mock-books';
import { BookCard } from './book-card';

describe('BookCard', () => {
  let fixture: ComponentFixture<BookCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [BookCard, VndPipe, TrimCover],
    }).compileComponents();

    fixture = TestBed.createComponent(BookCard);
    fixture.componentRef.setInput('book', makeBook({ title: 'Kitchen', image: 'https://example.com/kitchen.jpg' }));
    await fixture.whenStable();
  });

  it('lấy tên và ảnh bìa từ cùng một sách', () => {
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector('.book-cover img') as HTMLImageElement;
    expect(el.querySelector('.book-title')?.textContent?.trim()).toBe('Kitchen');
    expect(img.getAttribute('src')).toBe('https://example.com/kitchen.jpg');
    expect(img.alt).toBe('Kitchen');
  });

  it('hiện giá định dạng Việt Nam', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.book-price')?.textContent).toBe('80.000đ');
    expect(el.querySelector('.book-old')?.textContent).toBe('100.000đ');
  });
});
