import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NewsList } from './news-list';

describe('NewsList', () => {
  let component: NewsList;
  let fixture: ComponentFixture<NewsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NewsList],
    }).compileComponents();

    fixture = TestBed.createComponent(NewsList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
