import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';

import { OtpChallenge, VerifiedResponse } from '../../../models/user';
import { FAKE_OTP, provideFakeCustomerApi } from '../../../testing/fake-customer-api';
import { OtpVerify } from './otp-verify';

const CHALLENGE: OtpChallenge = {
  challengeId: 'c-verify_email', purpose: 'verify_email', email: 'ma*****n@gmail.com', resendAfter: 60, expiresIn: 600,
};

describe('OtpVerify', () => {
  let component: OtpVerify;
  let fixture: ComponentFixture<OtpVerify>;
  let el: HTMLElement;
  let verified: VerifiedResponse[];

  async function setup(challenge: OtpChallenge = CHALLENGE) {
    await TestBed.configureTestingModule({
      declarations: [OtpVerify],
      imports: [ReactiveFormsModule, RouterModule],
      providers: [provideRouter([]), provideFakeCustomerApi()],
    }).compileComponents();
    fixture = TestBed.createComponent(OtpVerify);
    fixture.componentRef.setInput('challenge', challenge);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    verified = [];
    component.verified.subscribe((res) => verified.push(res));
    await fixture.whenStable();
  }

  afterEach(() => vi.useRealTimers());

  it('hiện email đã che và tiêu đề theo mục đích', async () => {
    await setup();
    expect(el.textContent).toContain('ma*****n@gmail.com');
    expect(el.textContent).toContain('Xác minh email');
  });

  it('xác thực 2 lớp thì đổi nhãn', async () => {
    await setup({ ...CHALLENGE, challengeId: 'c-login_2fa', purpose: 'login_2fa' });
    expect(el.textContent).toContain('Xác thực 2 lớp');
    expect(el.textContent).toContain('hoàn tất đăng nhập');
  });

  it('mã phải đủ 6 chữ số; ký tự khác số bị bỏ', async () => {
    await setup();
    component.code.setValue('12a3');
    component.onInput();
    expect(component.code.value).toBe('123');
    component.submit();
    expect(component.codeError()).toBe('Mã OTP gồm đúng 6 chữ số');
  });

  it('sai mã thì báo số lần thử còn lại; đúng mã thì phát sự kiện verified kèm token', async () => {
    await setup();
    vi.useFakeTimers();
    component.code.setValue('000000');
    component.submit();
    vi.advanceTimersByTime(700);
    expect(component.error()).toContain('Bạn còn 4 lần thử');
    expect(verified.length).toBe(0);

    component.code.setValue(FAKE_OTP);
    component.submit();
    vi.advanceTimersByTime(700);
    expect(verified[0].token).toBe('f'.repeat(64));
    expect(verified[0].coupon?.code).toBe('WELCOME10');
  });

  it('đang đếm ngược thì chưa cho gửi lại; hết giờ gửi lại được và đếm lại 60 giây', async () => {
    await setup();
    expect(component.countdownText()).toBe('01:00');
    vi.useFakeTimers();
    component.resend();
    vi.advanceTimersByTime(700);
    expect(component.resending()).toBe(false);

    component.countdown.set(0);
    component.resend();
    expect(component.resending()).toBe(true);
    vi.advanceTimersByTime(700);
    expect(component.resending()).toBe(false);
    expect(component.countdownText()).toBe('01:00');
  });
});
