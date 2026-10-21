import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthorEvents } from './author-events';

describe('AuthorEvents', () => {
  let component: AuthorEvents;
  let fixture: ComponentFixture<AuthorEvents>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorEvents],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorEvents);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
