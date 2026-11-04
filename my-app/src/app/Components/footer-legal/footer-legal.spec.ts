import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterLegal } from './footer-legal';

describe('FooterLegal', () => {
  let fixture: ComponentFixture<FooterLegal>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [FooterLegal] }).compileComponents();
    fixture = TestBed.createComponent(FooterLegal);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('có 4 link: Privacy Policy, Terms of Service, Instagram, Facebook (không còn Substack)', () => {
    const labels = Array.from(el.querySelectorAll('.footer-legal li')).map((li) => li.textContent?.trim());
    expect(labels).toEqual(['Privacy Policy', 'Terms of Service', 'Instagram', 'Facebook']);
  });

  it('bấm Privacy Policy mở pop-up, bấm Đã hiểu thì đóng', () => {
    (el.querySelector('.footer-legal button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.modal h2')?.textContent).toContain('Chính sách bảo mật');
    (el.querySelector('.ok') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.modal')).toBeNull();
  });
});
