import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewPopup } from './review-popup';

describe('ReviewPopup', () => {
  let fixture: ComponentFixture<ReviewPopup>;
  let component: ReviewPopup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [ReviewPopup] }).compileComponents();
    fixture = TestBed.createComponent(ReviewPopup);
    fixture.componentRef.setInput('book', { bookId: 'b1', title: 'Kitchen', image: null, author: 'Banana Yoshimoto', meta: 'Sách mới · mua 18/10/2026' });
    component = fixture.componentInstance;
    vi.useFakeTimers();
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('chưa chọn sao thì báo lỗi, không gửi', () => {
    const sent = vi.fn();
    component.submitted.subscribe(sent);
    component.submit();
    expect(component.error()).toContain('chọn số sao');
    expect(sent).not.toHaveBeenCalled();
  });

  it('4 sao hiện "Rất thích"; chọn tag; gửi xong phát submitted + closed', () => {
    const sent = vi.fn();
    const closed = vi.fn();
    component.submitted.subscribe(sent);
    component.closed.subscribe(closed);
    component.rate(4);
    expect(component.ratingLabel()).toBe('Rất thích');
    component.toggleTag('Bản dịch mượt');
    expect(component.picked()).toEqual(['Bản dịch mượt']);
    component.submit();
    vi.advanceTimersByTime(700);
    expect(sent).toHaveBeenCalledWith({ bookId: 'b1', rating: 4 });
    expect(closed).toHaveBeenCalled();
  });

  it('nội dung tối đa 500 ký tự', () => {
    component.onContent({ target: { value: 'a'.repeat(600) } } as unknown as Event);
    expect(component.content().length).toBe(500);
  });
});
