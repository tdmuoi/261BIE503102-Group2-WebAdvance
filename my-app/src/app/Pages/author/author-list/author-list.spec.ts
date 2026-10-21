import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthorList } from './author-list';

describe('AuthorList', () => {
  let component: AuthorList;
  let fixture: ComponentFixture<AuthorList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorList],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
