import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { TrimCover } from '../../../../directives/trim-cover';
import { makeBook } from '../../../../testing/mock-books';
import { HomeDealCard } from './home-deal-card';

describe('HomeDealCard', () => {
  let fixture: ComponentFixture<HomeDealCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeDealCard, VndPipe, TrimCover],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeDealCard);
    fixture.componentRef.setInput('deal', makeBook({ title: 'Hồ Sơ Mật', image: 'https://example.com/hsm.jpg' }));
    await fixture.whenStable();
  });

  it('hiện tem giảm giá, giá mới, giá cũ và bìa đúng sách', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.deal-sticker')?.textContent).toBe('-20%');
    expect(el.querySelector('.sale-price')?.textContent).toBe('80.000đ');
    expect(el.querySelector('.old-price')?.textContent).toBe('100.000đ');
    expect(el.querySelector('.deal-cover img')?.getAttribute('src')).toBe('https://example.com/hsm.jpg');
    expect(el.querySelector('.deal-title')?.textContent).toBe('Hồ Sơ Mật');
  });
});
