import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthorWorks } from './author-works';

describe('AuthorWorks', () => {
  let component: AuthorWorks;
  let fixture: ComponentFixture<AuthorWorks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorWorks],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorWorks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
