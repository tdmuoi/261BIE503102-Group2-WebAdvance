import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Banners } from './banners';

describe('Banners', () => {
  let component: Banners;
  let fixture: ComponentFixture<Banners>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Banners],
    }).compileComponents();

    fixture = TestBed.createComponent(Banners);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
