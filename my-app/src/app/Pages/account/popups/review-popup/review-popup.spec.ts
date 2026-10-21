import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReviewPopup } from './review-popup';

describe('ReviewPopup', () => {
  let component: ReviewPopup;
  let fixture: ComponentFixture<ReviewPopup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReviewPopup],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewPopup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
