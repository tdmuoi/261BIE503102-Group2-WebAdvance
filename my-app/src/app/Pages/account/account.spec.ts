import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule, provideRouter } from '@angular/router';

import { User } from '../../models/user';
import { AuthService } from '../../services/auth-service';
import { Account, initialsOf, shortNameOf } from './account';
import { mockUnreadCount } from './notifications/notifications.mock';

describe('Account', () => {
  let fixture: ComponentFixture<Account>;
  let el: HTMLElement;
  const user: User = { _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'dung@lightbook.vn', phone: '0909123268' };
  let auth: { user: ReturnType<typeof signal<User | null>>; logout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    auth = { user: signal<User | null>(user), logout: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [Account],
      imports: [RouterModule],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
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
    // store mock dùng chung giữa các file test (vd. notifications.spec đánh dấu đã đọc) nên so với số hiện tại
    const unread = mockUnreadCount();
    expect(el.querySelector('.badge')?.textContent?.trim()).toBe(unread > 0 ? String(unread) : undefined);
    expect(el.querySelectorAll('.nav-item').length).toBe(4);
  });

  it('Đăng xuất thì xoá phiên và về trang chủ', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (el.querySelector('.logout') as HTMLButtonElement).click();
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
