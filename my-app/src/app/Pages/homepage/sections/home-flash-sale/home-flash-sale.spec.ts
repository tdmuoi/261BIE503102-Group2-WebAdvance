import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { makeBook, makeBooks } from '../../../../testing/mock-books';
import { HomeFlashSale } from './home-flash-sale';

describe('HomeFlashSale', () => {
  let fixture: ComponentFixture<HomeFlashSale>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeFlashSale, VndPipe],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeFlashSale);
  });

  it('chỉ lấy tối đa 5 sách đang giảm giá, giảm sâu nhất trước', async () => {
    fixture.componentRef.setInput('books', [
      ...makeBooks(6),
      makeBook({ _id: 'no-sale', discountPercent: 0 }),
      makeBook({ _id: 'deep', discountPercent: 40 }),
    ]);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('app-home-deal-card').length).toBe(5);
    const deals = (fixture.componentInstance as unknown as { deals: () => { _id: string }[] }).deals();
    expect(deals[0]._id).toBe('deep');
    expect(deals.some((deal) => deal._id === 'no-sale')).toBe(false);
  });

  it('hiện đồng hồ đếm ngược giờ:phút:giây', async () => {
    fixture.componentRef.setInput('books', makeBooks(2));
    await fixture.whenStable();

    const boxes = [...fixture.nativeElement.querySelectorAll('.countdown-box b')] as Element[];
    expect(boxes.length).toBe(3);
    for (const box of boxes) expect(box.textContent).toMatch(/^\d{2}$/);
  });
});
