import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule, provideRouter } from '@angular/router';

import { AccountService } from '../../../services/account-service';
import { AuthService } from '../../../services/auth-service';
import { Notifications, timeLabel } from './notifications';

describe('Notifications', () => {
  let component: Notifications;
  let fixture: ComponentFixture<Notifications>;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      declarations: [Notifications],
      imports: [RouterModule],
      providers: [provideRouter([]), { provide: AuthService, useValue: { token: null } }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Notifications);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.advanceTimersByTime(400);
  });

  afterEach(() => vi.useRealTimers());

  it('nhãn thời gian giống Figma', () => {
    const now = new Date('2026-10-29T15:00:00');
    expect(timeLabel('2026-10-29T13:00:00', now)).toBe('2 giờ trước');
    expect(timeLabel('2026-10-29T08:12:00', now)).toBe('Hôm nay, 08:12');
    expect(timeLabel('2026-10-28T09:00:00', now)).toBe('Hôm qua');
    expect(timeLabel('2026-10-27T09:00:00', now)).toBe('2 ngày trước');
    expect(timeLabel('2026-10-16T09:00:00', now)).toBe('16/10/2026');
  });

  it('trang đầu 6 thông báo, có nút xem cũ hơn; số chưa đọc cập nhật lên menu bên', () => {
    expect(component.items().length).toBe(6);
    expect(component.hasMore()).toBe(true);
    expect(component.allTotal()).toBe(8);
    expect(TestBed.inject(AccountService).unreadCount()).toBe(3);
  });

  it('lọc theo Đơn hàng', () => {
    component.setFilter('order');
    vi.advanceTimersByTime(400);
    expect(component.items().every((n) => n.type === 'order')).toBe(true);
  });

  it('bấm nút hành động thì đánh dấu đã đọc và chuyển trang', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const first = component.items().find((n) => !n.read)!;
    component.open(first);
    expect(component.items().find((n) => n._id === first._id)?.read).toBe(true);
    expect(navigate).toHaveBeenCalledWith(first.action!.link);
  });

  it('đánh dấu tất cả đã đọc', () => {
    component.markAllRead();
    expect(component.items().every((n) => n.read)).toBe(true);
    expect(TestBed.inject(AccountService).unreadCount()).toBe(0);
  });
});
