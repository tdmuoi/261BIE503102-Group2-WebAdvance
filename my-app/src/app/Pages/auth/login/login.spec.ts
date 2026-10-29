import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, provideRouter } from '@angular/router';

import { AuthService } from '../../../services/auth-service';
import { AuthArt } from '../auth-art/auth-art';
import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let auth: { isLoggedIn: () => boolean; setSession: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn> };
  let el: HTMLElement;

  beforeEach(async () => {
    auth = { isLoggedIn: () => false, setSession: vi.fn(), login: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [Login, AuthArt],
      imports: [ReactiveFormsModule, RouterModule],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('báo lỗi từng ô khi bấm Đăng nhập lúc form còn trống', async () => {
    component.submit();
    await fixture.whenStable();
    const helpers = [...el.querySelectorAll('.field-helper')].map((p) => p.textContent?.trim());
    expect(helpers).toEqual(['Vui lòng nhập email', 'Vui lòng nhập mật khẩu']);
  });

  it('kiểm tra định dạng theo chế độ Email / Số điện thoại', () => {
    const id = component.form.controls.identifier;
    id.setValue('abc');
    id.markAsTouched();
    expect(component.fieldError('identifier')).toBe('Email chưa đúng định dạng');

    component.setMethod('phone');
    id.setValue('12345');
    id.markAsTouched();
    expect(component.fieldError('identifier')).toBe('Số điện thoại chưa đúng định dạng');
    id.setValue('0901234567');
    expect(component.fieldError('identifier')).toBeNull();
  });

  it('mật khẩu dưới 8 ký tự thì báo lỗi', () => {
    const pw = component.form.controls.password;
    pw.setValue('123');
    pw.markAsTouched();
    expect(component.fieldError('password')).toBe('Mật khẩu phải có ít nhất 8 ký tự');
  });

  it('sai mật khẩu thì hiện khung lỗi kèm số lần thử còn lại', () => {
    vi.useFakeTimers();
    component.form.setValue({ identifier: 'demo@lightbook.vn', password: 'saimatkhau', remember: true });
    component.submit();
    vi.advanceTimersByTime(700);
    expect(component.alert()).toContain('Bạn còn 4 lần thử');
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('đăng nhập đúng thì lưu phiên và chuyển về returnUrl / trang chủ', () => {
    vi.useFakeTimers();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ identifier: 'demo@lightbook.vn', password: 'lightbook123', remember: false });
    component.submit();
    vi.advanceTimersByTime(700);
    expect(auth.setSession).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token' }), false);
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });
});
