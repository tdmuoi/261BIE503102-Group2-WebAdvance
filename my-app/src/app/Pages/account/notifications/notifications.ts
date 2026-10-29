import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AccountNotification, NotificationIcon, NotificationType } from '../../../models/account';
import { AccountService } from '../../../services/account-service';
import { ToastService } from '../../../services/toast-service';
import {
  USE_MOCK_NOTIFICATIONS,
  mockGetNotifications,
  mockMarkAllRead,
  mockMarkRead,
} from './notifications.mock';

type Filter = NotificationType | 'all';

const ICON_TONE: Record<NotificationIcon, string> = {
  truck: 'yellow', heart: 'yellow', recycle: 'mint', box: 'mint', book: 'mint-strong', tag: 'mint-strong',
};

/** "2 giờ trước" · "Hôm nay, 08:12" · "Hôm qua" · "2 ngày trước" · "16/10/2026" */
export function timeLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  const hours = Math.floor((now.getTime() - date.getTime()) / 3_600_000);
  if (days === 0) {
    if (hours < 1) return 'Vừa xong';
    if (hours < 6) return `${hours} giờ trước`;
    return `Hôm nay, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

@Component({
  selector: 'app-notifications',
  standalone: false,
  styleUrls: ['../account-page.css', './notifications.css'],
  templateUrl: './notifications.html',
})
export class Notifications implements OnInit {
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'order', label: 'Đơn hàng' },
    { value: 'promo', label: 'Ưu đãi' },
    { value: 'buyback', label: 'Thanh lý sách' },
    { value: 'bookshelf', label: 'Tủ sách' },
  ];

  readonly filter = signal<Filter>('all');
  readonly page = signal(1);
  readonly status = signal<'loading' | 'error' | 'ready'>('loading');
  readonly loadingMore = signal(false);
  readonly items = signal<AccountNotification[]>([]);
  readonly total = signal(0);
  readonly hasMore = signal(false);
  readonly allTotal = signal(0);

  readonly timeLabel = timeLabel;
  readonly unread = this.account.unreadCount;

  /** Chia nhóm "Hôm nay" / "Trước đó" */
  readonly groups = computed(() => {
    const today = new Date().toDateString();
    const list = this.items();
    return [
      { title: 'Hôm nay', items: list.filter((n) => new Date(n.createdAt).toDateString() === today) },
      { title: 'Trước đó', items: list.filter((n) => new Date(n.createdAt).toDateString() !== today) },
    ].filter((g) => g.items.length);
  });

  ngOnInit(): void {
    this.load();
  }

  tone(icon: NotificationIcon): string {
    return ICON_TONE[icon];
  }

  setFilter(value: Filter): void {
    if (value === this.filter()) return;
    this.filter.set(value);
    this.page.set(1);
    this.load();
  }

  loadMore(): void {
    this.page.update((p) => p + 1);
    this.load(true);
  }

  load(more = false): void {
    if (more) this.loadingMore.set(true);
    else this.status.set('loading');
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/account/notifications
    const request$ = USE_MOCK_NOTIFICATIONS
      ? mockGetNotifications(this.filter(), this.page())
      : this.account.getNotifications(this.filter(), this.page());
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.hasMore.set(res.hasMore);
        if (this.filter() === 'all') this.allTotal.set(res.total);
        this.account.setUnreadCount(res.unread);
        this.status.set('ready');
        this.loadingMore.set(false);
      },
      error: () => {
        this.loadingMore.set(false);
        if (more) this.toast.show('Chưa tải thêm được, vui lòng thử lại.');
        else this.status.set('error');
      },
    });
  }

  open(n: AccountNotification): void {
    this.markRead(n);
    if (n.action) this.router.navigateByUrl(n.action.link);
  }

  markRead(n: AccountNotification): void {
    if (n.read) return;
    // Cập nhật giao diện ngay, gọi API sau
    this.items.update((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    this.account.setUnreadCount(this.unread() - 1);
    (USE_MOCK_NOTIFICATIONS ? mockMarkRead(n._id) : this.account.markNotificationRead(n._id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => this.load() });
  }

  markAllRead(): void {
    if (!this.unread()) return;
    this.items.update((list) => list.map((x) => ({ ...x, read: true })));
    this.account.setUnreadCount(0);
    (USE_MOCK_NOTIFICATIONS ? mockMarkAllRead() : this.account.markAllNotificationsRead())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.show('Đã đánh dấu tất cả là đã đọc'),
        error: () => this.load(),
      });
  }
}
