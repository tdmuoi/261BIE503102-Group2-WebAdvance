import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookshelfEbooks } from './bookshelf-ebooks';

describe('BookshelfEbooks', () => {
  let component: BookshelfEbooks;
  let fixture: ComponentFixture<BookshelfEbooks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BookshelfEbooks],
    }).compileComponents();

    fixture = TestBed.createComponent(BookshelfEbooks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
