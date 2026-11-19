import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { Review } from '../../../../models/book';
import { ProductReviews } from './product-reviews';

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
      providers: [provideHttpClient(), provideHttpClientTesting()],
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

  it('có ảnh đại diện thì hiện ảnh, không có thì hiện chữ viết tắt', async () => {
    fixture.componentRef.setInput('reviews', [{ ...review('1', 5), userAvatar: 'https://res.cloudinary.com/x/avatar.jpg' }, review('2', 4)]);
    await fixture.whenStable();

    const heads = el().querySelectorAll('.review-head');
    expect(heads[0].querySelector<HTMLImageElement>('img.avatar')?.getAttribute('src')).toBe('https://res.cloudinary.com/x/avatar.jpg');
    expect(heads[1].querySelector('span.avatar')?.textContent?.trim()).toBe('TH');
  });

  it('đánh giá của chính mình thì không bấm Hữu ích được', async () => {
    fixture.componentRef.setInput('reviews', [{ ...review('1', 5), isMine: true }]);
    await fixture.whenStable();

    const buttons = el().querySelectorAll<HTMLButtonElement>('.helpful-btn');
    expect(buttons.length).toBe(2);
    expect([...buttons].every((b) => b.disabled)).toBe(true);
    TestBed.inject(HttpTestingController).verify();
  });
});
