import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { Review } from '../../../../models/book';
import { ProductReviews } from './product-reviews';

/** Dữ liệu giả chỉ dùng trong test — app chưa có API đánh giá */
const review = (id: string, rating: number): Review => ({
  _id: id,
  userName: 'Thu Hà',
  rating,
  content: 'Hay',
  createdAt: '2026-10-12T00:00:00.000Z',
  verifiedPurchase: true,
  helpfulCount: 2,
});

describe('ProductReviews', () => {
  let fixture: ComponentFixture<ProductReviews>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [ProductReviews],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductReviews);
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('chưa có đánh giá thì hiện empty state', async () => {
    await fixture.whenStable();
    expect(el().querySelector('.reviews-empty')).not.toBeNull();
    expect(el().querySelector('.summary')).toBeNull();
  });

  it('tính điểm trung bình, phân bố sao và chỉ hiện 3 đánh giá đầu', async () => {
    fixture.componentRef.setInput('reviews', [review('1', 5), review('2', 5), review('3', 4), review('4', 2)]);
    await fixture.whenStable();

    expect(el().querySelector('.summary-score strong')?.textContent).toBe('4.0');
    expect([...el().querySelectorAll('.bar-pct')].map((n) => n.textContent)).toEqual(['50%', '25%', '0%', '25%', '0%']);
    expect(el().querySelectorAll('.review').length).toBe(3);

    el().querySelector<HTMLButtonElement>('.reviews-all')!.click();
    await fixture.whenStable();
    expect(el().querySelectorAll('.review').length).toBe(4);
  });
});
