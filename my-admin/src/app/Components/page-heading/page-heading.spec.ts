import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeading } from './page-heading';

describe('PageHeading', () => {
  let component: PageHeading;
  let fixture: ComponentFixture<PageHeading>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PageHeading],
    }).compileComponents();

    fixture = TestBed.createComponent(PageHeading);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
