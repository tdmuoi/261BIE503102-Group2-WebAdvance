import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { vi } from 'vitest';
import { Login } from './login';
import { AdminAuthService } from '../../services/admin-auth-service';
import { AdminSession } from '../../models/admin-auth';

describe('Login API and template-driven form', () => {
  let fixture: ComponentFixture<Login>;
  let auth: {
    user: AdminSession['user'] | null;
    checkSession: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  const session: AdminSession = {
    user: { _id: 'test', fullName: 'Test', email: 'admin@example.invalid', role: 'admin' },
    csrfToken: 'test-csrf',
    expiresAt: '2099-01-01T00:00:00Z',
  };
  beforeEach(async () => {
    auth = {
      user: null,
      checkSession: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
      login: vi.fn(),
      logout: vi.fn(),
    };
    await TestBed.configureTestingModule({
      declarations: [Login],
      imports: [FormsModule, RouterModule],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  async function fill(email: string, password: string) {
    for (const [id, value] of [
      ['email', email],
      ['password', password],
    ]) {
      const input = fixture.nativeElement.querySelector('#' + id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function form(): NgForm {
    return fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
  }
  it('keeps blank form invalid', () => {
    expect(form().invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('.submit-button').disabled).toBe(true);
    fixture.componentInstance.onLogin(form());
    expect(auth.login).not.toHaveBeenCalled();
  });
  async function pendingSession() {
    fixture.destroy();
    const result = new Subject<AdminSession>();
    auth.checkSession.mockReturnValue(result);
    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();
    return result;
  }
  it('allows typing while the initial session check is pending', async () => {
    await pendingSession();
    expect(fixture.nativeElement.querySelector('#email').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('#password').disabled).toBe(false);
    await fill('admin@example.invalid', 'test-password');
    expect(fixture.componentInstance.user.email).toBe('admin@example.invalid');
    expect(fixture.componentInstance.user.password).toBe('test-password');
    expect(fixture.nativeElement.querySelector('.submit-button').disabled).toBe(true);
  });
  it('refreshes the view after an asynchronous session response without manual detection', async () => {
    const result = await pendingSession();
    result.error(new HttpErrorResponse({ status: 401 }));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Đang kiểm tra phiên');
    expect(fixture.nativeElement.querySelector('#email').disabled).toBe(false);
  });
  it('refreshes the view after an asynchronous login error without manual detection', async () => {
    const result = new Subject<AdminSession>();
    auth.login.mockReturnValue(result);
    await fill('admin@example.invalid', 'test-password');
    fixture.nativeElement.querySelector('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#email').disabled).toBe(true);
    result.error(new HttpErrorResponse({ status: 401 }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#email').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('quyền quản trị không hợp lệ');
  });
  it('unblocks submission and shows an error when the session request times out', async () => {
    fixture.destroy();
    auth.checkSession.mockReturnValue(new Subject<AdminSession>());
    new TestScheduler(() => {}).run(({ flush }) => {
      fixture = TestBed.createComponent(Login);
      fixture.detectChanges();
      expect(fixture.componentInstance.checking).toBe(true);
      flush();
      expect(fixture.componentInstance.checking).toBe(false);
    });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Backend phản hồi quá lâu');
    await fill('admin@example.invalid', 'test-password');
    expect(fixture.nativeElement.querySelector('.submit-button').disabled).toBe(false);
  });
  it('restores inputs and shows an error when the login request times out', async () => {
    auth.login.mockReturnValue(new Subject<AdminSession>());
    await fill('admin@example.invalid', 'test-password');
    new TestScheduler(() => {}).run(({ flush }) => {
      fixture.componentInstance.onLogin(form());
      expect(fixture.componentInstance.loading).toBe(true);
      flush();
      expect(fixture.componentInstance.loading).toBe(false);
    });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#email').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Backend phản hồi quá lâu');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
  it('rejects malformed email', async () => {
    await fill('bad-email', 'test-password');
    fixture.componentInstance.onLogin(form());
    fixture.detectChanges();
    expect(form().invalid).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Email không đúng định dạng');
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('rejects missing password', async () => {
    await fill('admin@example.invalid', '');
    fixture.componentInstance.onLogin(form());
    expect(form().invalid).toBe(true);
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('uses ngSubmit, loading and API success before navigating', async () => {
    const result = new Subject<AdminSession>();
    auth.login.mockReturnValue(result);
    await fill('ADMIN@example.invalid', 'test-password');
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(auth.login).toHaveBeenCalledWith({
      email: 'admin@example.invalid',
      password: 'test-password',
      rememberMe: false,
    });
    expect(fixture.componentInstance.loading).toBe(true);
    expect(fixture.nativeElement.querySelector('.submit-button').disabled).toBe(true);
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    result.next(session);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(fixture.componentInstance.user.password).toBe('');
  });
  for (const [status, message] of [
    [401, 'không hợp lệ'],
    [0, 'Không kết nối được Backend'],
    [429, '15 phút'],
  ] as const) {
    it('handles login error ' + status, async () => {
      auth.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      await fill('admin@example.invalid', 'test-password');
      fixture.componentInstance.onLogin(form());
      expect(fixture.componentInstance.error).toContain(message);
      expect(fixture.componentInstance.loading).toBe(false);
      expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    });
  }
  it('confirms server logout', () => {
    auth.logout.mockReturnValue(of(undefined));
    fixture.componentInstance.logout();
    expect(auth.logout).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.message).toContain('kết thúc phiên');
  });
  it('does not confirm failed logout', () => {
    auth.logout.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    fixture.componentInstance.logout();
    expect(fixture.componentInstance.message).toBe('');
    expect(fixture.componentInstance.error).toContain('Backend');
  });
});
