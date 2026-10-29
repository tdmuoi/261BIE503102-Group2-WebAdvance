import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterModule, provideRouter } from '@angular/router';

import { AboutUs } from './about-us';

describe('AboutUs', () => {
  let fixture: ComponentFixture<AboutUs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AboutUs],
      imports: [RouterModule],
      providers: [provideRouter([])],
      // app-marquee có test riêng
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutUs);
    await fixture.whenStable();
  });

  it('hiện đủ các phần theo Figma', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.timeline li').length).toBe(4);
    expect(el.querySelectorAll('.value').length).toBe(4);
    expect(el.querySelectorAll('.stat').length).toBe(4);
    expect(el.querySelectorAll('.member').length).toBe(4);
    expect(el.querySelectorAll('.partner').length).toBe(8);
  });

  it('nút "Tham gia miễn phí" dẫn tới trang đăng ký', () => {
    const link = fixture.nativeElement.querySelector('.cta-btn') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/register');
  });
});
