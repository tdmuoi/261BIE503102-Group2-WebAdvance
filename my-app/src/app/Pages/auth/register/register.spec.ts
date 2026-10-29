import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';

import { AuthService } from '../../../services/auth-service';
import { AuthArt } from '../auth-art/auth-art';
import { Register } from './register';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;
  let auth: { isLoggedIn: () => boolean; setSession: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
  let el: HTMLElement;

  const fill = (overrides: Partial<Record<string, string | boolean>> = {}) =>
    component.form.setValue({
      fullName: 'Trần Mai Anh',
      email: 'mai.tran@gmail.com',
      phone: '',
      password: 'lightbook1',
      confirmPassword: 'lightbook1',
      terms: true,
      newsletter: false,
      ...overrides,
    } as never);

  beforeEach(async () => {
    auth = { isLoggedIn: () => false, setSession: vi.fn(), register: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [Register, AuthArt],
      imports: [ReactiveFormsModule, RouterModule],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('bấm Tạo tài khoản khi trống thì báo "Còn N trường cần sửa"', async () => {
    component.submit();
    await fixture.whenStable();
    // Họ tên, email, mật khẩu, nhập lại, điều khoản (SĐT không bắt buộc)
    expect(el.querySelector('.auth-alert-title')?.textContent).toContain('Còn 5 trường cần sửa');
    expect(el.textContent).toContain('Bạn cần đồng ý với điều khoản để tiếp tục');
  });

  it('kiểm tra mật khẩu: độ dài, chữ + số, nhập lại khớp', () => {
    fill({ password: 'abc', confirmPassword: 'abc' });
    component.form.markAllAsTouched();
    expect(component.fieldError('password')).toBe('Mật khẩu phải có ít nhất 8 ký tự');
    fill({ password: 'abcdefgh', confirmPassword: 'abcdefgh' });
    expect(component.fieldError('password')).toBe('Mật khẩu cần có cả chữ và số');
    fill({ confirmPassword: 'khac1234' });
    expect(component.fieldError('confirmPassword')).toBe('Mật khẩu nhập lại chưa khớp');
  });

  it('SĐT không bắt buộc, nhưng nhập thì phải đúng định dạng', () => {
    fill();
    component.form.markAllAsTouched();
    expect(component.fieldError('phone')).toBeNull();
    expect(component.fieldOk('phone')).toBe(false);
    fill({ phone: '123' });
    expect(component.fieldError('phone')).toBe('Số điện thoại chưa đúng định dạng');
  });

  it('ô nhập đúng thì có trạng thái hợp lệ (viền xanh)', () => {
    fill();
    component.form.markAllAsTouched();
    expect(component.fieldOk('fullName')).toBe(true);
    expect(component.fieldOk('email')).toBe(true);
  });

  it('email đã có người dùng thì đánh dấu đỏ ô email', () => {
    vi.useFakeTimers();
    fill({ email: 'demo@lightbook.vn' });
    component.submit();
    vi.advanceTimersByTime(700);
    expect(component.fieldError('email')).toBe('Email này đã được đăng ký');
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('đăng ký thành công thì đăng nhập luôn và hiện mã giảm giá', async () => {
    vi.useFakeTimers();
    fill();
    component.submit();
    vi.advanceTimersByTime(700);
    vi.useRealTimers();
    expect(auth.setSession).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token' }), true);
    await fixture.whenStable();
    expect(el.textContent).toContain('LIGHTBOOK10');
    expect(el.textContent).toContain('mai.tran@gmail.com');
  });
});
