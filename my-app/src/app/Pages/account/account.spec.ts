import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule, provideRouter } from '@angular/router';

import { User } from '../../models/user';
import { AuthService } from '../../services/auth-service';
import { Account, initialsOf, shortNameOf } from './account';
import { provideFakeCustomerApi } from '../../testing/fake-customer-api';

describe('Account', () => {
  let fixture: ComponentFixture<Account>;
  let el: HTMLElement;
  const user: User = { _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'dung@lightbook.vn', phone: '0909123268' };
  let auth: { user: ReturnType<typeof signal<User | null>>; logout: ReturnType<typeof vi.fn>; isLoggedIn: () => boolean; token: string };

  beforeEach(async () => {
    auth = { user: signal<User | null>(user), logout: vi.fn(), isLoggedIn: () => true, token: 'f'.repeat(64) };
    await TestBed.configureTestingModule({
      declarations: [Account],
      imports: [RouterModule],
      providers: [provideRouter([]), provideFakeCustomerApi(), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Account);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('tên rút gọn và chữ viết tắt lấy 2 chữ cuối', () => {
    expect(shortNameOf('Nguyễn Thùy Dung')).toBe('Thùy Dung');
    expect(initialsOf('Nguyễn Thùy Dung')).toBe('TD');
  });

  it('hiện thông tin người dùng, hạng thành viên và số thông báo chưa đọc', async () => {
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(el.querySelector('.user-name')?.textContent).toContain('Thùy Dung');
    expect(el.querySelector('.tier')?.textContent).toContain('Thành viên Bạc');
    expect(el.querySelector('.badge')?.textContent?.trim()).toBe('3');
    expect(el.querySelectorAll('.nav-item').length).toBe(4);
  });

  it('Đăng xuất: hỏi lại trước, "Ở lại" thì không đăng xuất; xác nhận thì xoá phiên và về trang chủ', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (el.querySelector('.logout') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.logout-modal')?.textContent).toContain('Đăng xuất khỏi Lightbook?');
    (el.querySelector('.logout-modal .btn-ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.logout-modal')).toBeNull();
    expect(auth.logout).not.toHaveBeenCalled();
    (el.querySelector('.logout') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('.logout-modal .btn-pink') as HTMLButtonElement).click();
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
