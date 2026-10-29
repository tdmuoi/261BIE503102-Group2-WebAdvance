import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { AccountService } from '../../services/account-service';
import { AuthService } from '../../services/auth-service';
import { ToastService } from '../../services/toast-service';
import { USE_MOCK_ACCOUNT, mockGetProfile } from './account.mock';
import { USE_MOCK_NOTIFICATIONS, mockGetNotifications } from './notifications/notifications.mock';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  /** Các trang con được tính là đang ở mục này */
  match: string[];
  badge?: boolean;
}

/** "Nguyễn Thùy Dung" → "TD" (2 chữ cuối) */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** "Nguyễn Thùy Dung" → "Thùy Dung" */
export function shortNameOf(name: string): string {
  return name.trim().split(/\s+/).slice(-2).join(' ');
}

/**
 * Khung trang Tài khoản: menu bên (thông tin người dùng, điều hướng, đăng xuất, thẻ thanh lý sách)
 * + vùng nội dung con <router-outlet>. Route đã chặn bằng authGuard nên ở đây luôn có người đăng nhập.
 */
@Component({
  selector: 'app-account',
  standalone: false,
  styleUrl: './account.css',
  templateUrl: './account.html',
})
export class Account implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly nav: NavItem[] = [
    { label: 'Thông tin cá nhân', icon: 'user', link: '/account/profile-info', match: ['/account/profile-info', '/account/address'] },
    { label: 'Tủ sách của tôi', icon: 'book', link: '/account/bookshelf-purchased', match: ['/account/bookshelf-', '/account/wishlist'] },
    { label: 'Quản lý đơn hàng', icon: 'box', link: '/account/orders', match: ['/account/orders'] },
    { label: 'Thông báo', icon: 'bell', link: '/account/notifications', match: ['/account/notifications'], badge: true },
  ];

  readonly loadError = this.account.profileError;
  readonly profile = this.account.profile;
  readonly unreadCount = this.account.unreadCount;

  /** Khi hồ sơ chưa tải xong thì lấy tạm tên từ phiên đăng nhập */
  readonly displayName = computed(() => this.profile()?.fullName ?? this.auth.user()?.fullName ?? '');
  readonly shortName = computed(() => shortNameOf(this.displayName()));
  readonly initials = computed(() => initialsOf(this.displayName()));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  ngOnInit(): void {
    this.loadProfile();
  }

  isActive(item: NavItem): boolean {
    const url = this.url();
    return item.match.some((prefix) => url.startsWith(prefix));
  }

  loadProfile(): void {
    const user = this.auth.user();
    if (!user) return;
    this.account.setProfileError(false);
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/account/profile
    const request$ = USE_MOCK_ACCOUNT ? mockGetProfile(user) : this.account.getProfile();
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (profile) => this.account.setProfile(profile),
      error: () => this.account.setProfileError(true),
    });
    // Số thông báo chưa đọc cho badge ở menu bên
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/account/notifications
    (USE_MOCK_NOTIFICATIONS ? mockGetNotifications('all', 1) : this.account.getNotifications('all', 1))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.account.setUnreadCount(res.unread), error: () => this.account.setUnreadCount(0) });
  }

  logout(): void {
    this.auth.logout();
    this.account.setProfile(null);
    this.account.setUnreadCount(0);
    this.toast.show('Bạn đã đăng xuất');
    this.router.navigateByUrl('/');
  }
}
