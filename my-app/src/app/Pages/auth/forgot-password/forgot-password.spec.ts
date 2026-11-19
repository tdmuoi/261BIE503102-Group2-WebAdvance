import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, RouterModule, provideRouter } from '@angular/router';

import { FAKE_OTP, provideFakeCustomerApi } from '../../../testing/fake-customer-api';
import { AuthArt } from '../auth-art/auth-art';
import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let el: HTMLElement;

  async function setup(query: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      declarations: [ForgotPassword, AuthArt],
      imports: [ReactiveFormsModule, RouterModule],
      providers: [
        provideRouter([]),
        provideFakeCustomerApi(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  function sendCode() {
    component.form.controls.email.setValue('Mai.Tran@gmail.com');
    component.submit();
    vi.advanceTimersByTime(700);
  }

  afterEach(() => vi.useRealTimers());

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('điền sẵn email truyền từ trang Đăng nhập', async () => {
    await setup({ email: 'mai.tran@gmail.com' });
    expect(component.form.controls.email.value).toBe('mai.tran@gmail.com');
  });

  it('email sai định dạng thì báo lỗi, không gửi', async () => {
    await setup();
    component.form.controls.email.setValue('mai.tran@gmail');
    component.submit();
    expect(component.emailError()).toBe('Email chưa đúng định dạng');
    expect(component.sentTo()).toBeNull();
  });

  it('gửi mã xong thì sang bước nhập OTP, đếm ngược 60s rồi mới cho gửi lại', async () => {
    await setup();
    vi.useFakeTimers();
    sendCode();
    expect(component.sentTo()).toBe('de**o@lightbook.vn');
    expect(component.countdownText()).toBe('01:00');

    vi.advanceTimersByTime(59_000);
    expect(component.countdown()).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(component.countdown()).toBe(0);

    component.resend();
    vi.advanceTimersByTime(700);
    expect(component.countdownText()).toBe('01:00');
  });

  it('mật khẩu mới phải đủ 8 ký tự, có chữ và số, nhập lại khớp', async () => {
    await setup();
    vi.useFakeTimers();
    sendCode();
    component.resetForm.setValue({ code: '12', password: 'abc', confirmPassword: 'abd' });
    component.reset();
    expect(component.resetError('code')).toBe('Mã OTP gồm đúng 6 chữ số');
    expect(component.resetError('password')).toBe('Mật khẩu phải có ít nhất 8 ký tự');
    expect(component.resetError('confirmPassword')).toBe('Mật khẩu nhập lại chưa khớp');
  });

  it('sai mã thì báo lỗi; đúng mã thì đổi mật khẩu xong', async () => {
    await setup();
    vi.useFakeTimers();
    sendCode();
    component.resetForm.setValue({ code: '000000', password: 'lightbook9', confirmPassword: 'lightbook9' });
    component.reset();
    vi.advanceTimersByTime(700);
    expect(component.serverError()).toContain('Mã OTP chưa đúng');
    expect(component.done()).toBe(false);

    component.resetForm.patchValue({ code: FAKE_OTP });
    component.reset();
    vi.advanceTimersByTime(700);
    expect(component.done()).toBe(true);
    vi.useRealTimers();
    await fixture.whenStable();
    expect(el.textContent).toContain('đăng xuất trên mọi thiết bị');
  });
});
