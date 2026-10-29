import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, RouterModule, provideRouter } from '@angular/router';

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
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
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

  it('gửi xong thì hiện "Kiểm tra hộp thư", đếm ngược 30s rồi mới cho gửi lại', async () => {
    await setup();
    vi.useFakeTimers();
    component.form.controls.email.setValue('Mai.Tran@gmail.com');
    component.submit();
    vi.advanceTimersByTime(700);
    expect(component.sentTo()).toBe('mai.tran@gmail.com');
    expect(component.countdownText()).toBe('00:30');

    vi.advanceTimersByTime(29_000);
    expect(component.countdown()).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(component.countdown()).toBe(0);

    component.resend();
    vi.advanceTimersByTime(700);
    expect(component.countdownText()).toBe('00:30');
  });
});
