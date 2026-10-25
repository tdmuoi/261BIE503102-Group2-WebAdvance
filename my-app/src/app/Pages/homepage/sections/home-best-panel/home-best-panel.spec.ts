import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { TrimCover } from '../../../../directives/trim-cover';
import { makeBook } from '../../../../testing/mock-books';
import { HomeBestPanel } from './home-best-panel';

describe('HomeBestPanel', () => {
  let fixture: ComponentFixture<HomeBestPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeBestPanel, VndPipe, TrimCover],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeBestPanel);
    fixture.componentRef.setInput('book', makeBook({ title: 'Kitchen' }));
    fixture.componentRef.setInput('rank', 2);
    await fixture.whenStable();
  });

  it('hiện thứ hạng, tên sách và trạng thái chưa có review', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.panel-badge')?.textContent).toContain('#2');
    expect(el.querySelector('.panel-title')?.textContent).toBe('Kitchen');
    expect(el.querySelector('.reviews-empty')).not.toBeNull();
  });
});
