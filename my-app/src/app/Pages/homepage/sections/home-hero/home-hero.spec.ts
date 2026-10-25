import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeHero } from './home-hero';

describe('HomeHero', () => {
  let fixture: ComponentFixture<HomeHero>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeHero],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeHero);
    await fixture.whenStable();
  });

  it('hiện tiêu đề và 4 bìa sách trang trí', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'discover a story that might change your day.',
    );
    expect(el.querySelectorAll('.hero-book').length).toBe(4);
  });
});
