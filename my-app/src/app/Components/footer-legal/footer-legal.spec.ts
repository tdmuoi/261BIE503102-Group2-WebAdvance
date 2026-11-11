import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';

import { FooterLegal } from './footer-legal';

describe('FooterLegal', () => {
  let fixture: ComponentFixture<FooterLegal>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [FooterLegal], imports: [RouterModule], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(FooterLegal);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('có 3 link chính sách + Instagram, Facebook', () => {
    const labels = Array.from(el.querySelectorAll('.footer-legal li')).map((li) => li.textContent?.trim());
    expect(labels).toEqual(['Privacy Policy', 'Payment Policy', 'Purchase & Returns', 'Instagram', 'Facebook']);
  });

  it('link chính sách mở trang /policies đúng mục', () => {
    const hrefs = Array.from(el.querySelectorAll('.footer-legal a')).slice(0, 3).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/policies#bao-mat', '/policies#thanh-toan', '/policies#doi-tra']);
  });
});
