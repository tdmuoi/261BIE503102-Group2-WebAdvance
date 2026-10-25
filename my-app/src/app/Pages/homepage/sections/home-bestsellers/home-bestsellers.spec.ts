import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { makeBooks } from '../../../../testing/mock-books';
import { HomeBestsellers } from './home-bestsellers';

describe('HomeBestsellers', () => {
  let fixture: ComponentFixture<HomeBestsellers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeBestsellers, VndPipe],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeBestsellers);
    fixture.componentRef.setInput('books', makeBooks(8));
    await fixture.whenStable();
  });

  const selectedTitle = () =>
    (fixture.componentInstance as unknown as { selected: () => { title: string } }).selected().title;

  it('hiện top 5, mặc định chọn dòng đầu', () => {
    expect(fixture.nativeElement.querySelectorAll('.best-row').length).toBe(5);
    // Sách cập nhật gần nhất đứng đầu
    expect(selectedTitle()).toBe('Sách số 8');
  });

  it('bấm một dòng thì panel đổi theo sách đó', async () => {
    const rows = fixture.nativeElement.querySelectorAll('.best-row');
    (rows[2] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(selectedTitle()).toBe(rows[2].querySelector('.best-title').textContent.trim());
    expect(rows[2].classList).toContain('is-selected');
  });
});
