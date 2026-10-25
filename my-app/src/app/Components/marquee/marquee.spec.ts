import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Marquee } from './marquee';

describe('Marquee', () => {
  let component: Marquee;
  let fixture: ComponentFixture<Marquee>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Marquee],
    }).compileComponents();

    fixture = TestBed.createComponent(Marquee);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
