import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookshelfPurchased } from './bookshelf-purchased';

describe('BookshelfPurchased', () => {
  let component: BookshelfPurchased;
  let fixture: ComponentFixture<BookshelfPurchased>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BookshelfPurchased],
    }).compileComponents();

    fixture = TestBed.createComponent(BookshelfPurchased);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
