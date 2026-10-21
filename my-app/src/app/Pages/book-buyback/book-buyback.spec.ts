import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookBuyback } from './book-buyback';

describe('BookBuyback', () => {
  let component: BookBuyback;
  let fixture: ComponentFixture<BookBuyback>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BookBuyback],
    }).compileComponents();

    fixture = TestBed.createComponent(BookBuyback);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
