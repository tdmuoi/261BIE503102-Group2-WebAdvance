import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { makeBook, makeBooks } from '../../../../testing/mock-books';
import { HomeRecommendations } from './home-recommendations';

describe('HomeRecommendations', () => {
  let fixture: ComponentFixture<HomeRecommendations>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeRecommendations, VndPipe],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeRecommendations);
    fixture.componentRef.setInput('books', [
      ...makeBooks(20),
      makeBook({ _id: 'kid', categoryId: 'c2', categoryName: 'Thiếu nhi' }),
    ]);
    await fixture.whenStable();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('hiện 15 cuốn đầu và nút xem thêm phần còn lại', async () => {
    expect(el().querySelectorAll('app-book-card').length).toBe(15);
    const more = el().querySelector('.recommend-load') as HTMLButtonElement;
    expect(more.textContent).toContain('6');

    more.click();
    await fixture.whenStable();
    expect(el().querySelectorAll('app-book-card').length).toBe(21);
    expect(el().querySelector('.recommend-load')).toBeNull();
  });

  it('lọc theo chip thể loại', async () => {
    const chips = [...el().querySelectorAll('.chip')] as HTMLButtonElement[];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['Tất cả', 'Văn học', 'Thiếu nhi']);

    chips[2].click();
    await fixture.whenStable();
    expect(el().querySelectorAll('app-book-card').length).toBe(1);
  });
});
