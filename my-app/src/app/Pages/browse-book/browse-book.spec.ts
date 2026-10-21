import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowseBook } from './browse-book';

describe('BrowseBook', () => {
  let component: BrowseBook;
  let fixture: ComponentFixture<BrowseBook>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BrowseBook],
    }).compileComponents();

    fixture = TestBed.createComponent(BrowseBook);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
