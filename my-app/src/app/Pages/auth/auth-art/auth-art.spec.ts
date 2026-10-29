import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthArt } from './auth-art';

describe('AuthArt', () => {
  let fixture: ComponentFixture<AuthArt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [AuthArt] }).compileComponents();
    fixture = TestBed.createComponent(AuthArt);
    await fixture.whenStable();
  });

  it('mặc định nền vàng, tone pink thì đổi nền hồng', async () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('is-pink')).toBe(false);
    fixture.componentRef.setInput('tone', 'pink');
    await fixture.whenStable();
    expect(host.classList.contains('is-pink')).toBe(true);
  });
});
