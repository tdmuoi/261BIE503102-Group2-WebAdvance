import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { makeBook } from '../../../../testing/mock-books';
import { HomeAuthors } from './home-authors';

describe('HomeAuthors', () => {
  let fixture: ComponentFixture<HomeAuthors>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeAuthors],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeAuthors);
  });

  it('chọn tác giả nhiều sách nhất, hiện chữ cái đầu khi không có ảnh', async () => {
    fixture.componentRef.setInput('books', [
      makeBook({ _id: '1', authorId: 'a1' }),
      makeBook({ _id: '2', authorId: 'a1' }),
      makeBook({ _id: '3', authorId: 'a2' }),
    ]);
    fixture.componentRef.setInput('authors', [
      { _id: 'a2', name: 'Anna Lang' },
      { _id: 'a1', name: 'Nguyễn Nhật Ánh', img: 'img/books/office_preview.jpg' },
      { _id: 'a3', name: 'Không có sách' },
    ]);
    await fixture.whenStable();

    const names = [...fixture.nativeElement.querySelectorAll('.author-name')].map((n: Element) => n.textContent);
    expect(names).toEqual(['Nguyễn Nhật Ánh', 'Anna Lang']);
    expect(fixture.nativeElement.querySelector('.author-avatar').textContent.trim()).toBe('NA');
  });
});
