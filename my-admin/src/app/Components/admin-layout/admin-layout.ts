import { ChangeDetectorRef, Component, DestroyRef, Injector, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AdminAuthService } from '../../services/admin-auth-service';

/**
 * Khung chung cho mọi trang admin (trừ /login): sidebar + topbar + <router-outlet>.
 * Đã gắn sẵn trong app-routing-module.ts, các trang con KHÔNG cần tự thêm sidebar/topbar.
 *
 * Muốn thêm mục menu: thêm 1 dòng vào navGroups bên dưới.
 *   - link : đường dẫn khi bấm
 *   - match: các đường dẫn con cũng làm sáng mục này (vd /book-form/123 vẫn sáng "Sách")
 *   - icon : chuỗi path SVG (viewBox 24x24, nét 2px)
 */
export interface NavItem {
  label: string;
  link: string;
  icon: string;
  match?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  order:
    'M9 3h6v4H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3M9 12h6M9 16h6',
  refund: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  buyback: 'M17 3l4 4-4 4M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4M21 13v2a2 2 0 0 1-2 2H3',
  banner: 'M3 5h18v14H3zM3 16l5-5 5 5M14 14l2-2 5 5M15.5 8.5h.01',
  voucher:
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM13 5v2M13 11v2M13 17v2',
  news: 'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  menu: 'M3 6h18M3 12h18M3 18h18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
};

@Component({
  selector: 'app-admin-layout',
  standalone: false,
  styleUrl: './admin-layout.css',
  templateUrl: './admin-layout.html',
})
export class AdminLayout {
  private router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  loggingOut = false;
  logoutError = '';

  readonly icons = ICONS;

  readonly navGroups: NavGroup[] = [
    {
      title: 'Tổng quan',
      items: [{ label: 'Dashboard', link: '/dashboard', icon: ICONS.dashboard }],
    },
    {
      title: 'Kho sách',
      items: [
        { label: 'Sách', link: '/book-list', icon: ICONS.book, match: ['/book-form'] },
        { label: 'Tồn kho', link: '/inventory', icon: ICONS.box },
      ],
    },
    {
      title: 'Bán hàng',
      items: [
        { label: 'Đơn hàng', link: '/orders', icon: ICONS.order, match: ['/order-detail'] },
        { label: 'Đổi trả & hoàn tiền', link: '/refunds', icon: ICONS.refund },
        {
          label: 'Yêu cầu thanh lý',
          link: '/buyback-requests',
          icon: ICONS.buyback,
          match: ['/buyback-detail'],
        },
      ],
    },
    {
      title: 'Marketing & nội dung',
      items: [
        { label: 'Banner & quảng cáo', link: '/banners', icon: ICONS.banner },
        { label: 'Mã giảm giá', link: '/vouchers', icon: ICONS.voucher },
        { label: 'Lightbook News', link: '/news-list', icon: ICONS.news, match: ['/news-editor'] },
      ],
    },
    {
      title: 'Hệ thống',
      items: [
        { label: 'Tài khoản', link: '/accounts', icon: ICONS.users, match: ['/customer-detail'] },
        { label: 'Cài đặt', link: '/settings', icon: ICONS.settings, match: ['/users-roles'] },
      ],
    },
  ];

  /** Sidebar trên điện thoại/tablet (màn hình < 1024px) */
  sidebarOpen = false;
  currentUrl = this.router.url;

  /** Thông tin admin đang đăng nhập — trang Login lưu vào localStorage key "adminUser" */
  admin = this.readAdmin();

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.currentUrl = e.urlAfterRedirects;
        this.sidebarOpen = false; // chuyển trang thì đóng sidebar trên mobile
      });
  }

  isActive(item: NavItem): boolean {
    const path = this.currentUrl.split(/[?#]/)[0];
    return [item.link, ...(item.match ?? [])].some((p) => path === p || path.startsWith(p + '/'));
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  /** Ô tìm kiếm trên topbar: tìm sách theo tên/SKU -> /book-list?q=... */
  search(keyword: string): void {
    const q = keyword.trim();
    this.router.navigate(['/book-list'], { queryParams: q ? { q } : {} });
  }

  logout(): void {
    if (this.loggingOut) return;
    this.loggingOut = true;
    this.logoutError = '';
    this.changeDetector.markForCheck();
    this.injector
      .get(AdminAuthService)
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loggingOut = false;
          this.changeDetector.markForCheck();
          try {
            localStorage.removeItem('adminUser');
          } catch {
            /* Storage may be disabled. */
          }
          void this.router.navigate(['/login']);
        },
        error: () => {
          this.loggingOut = false;
          this.logoutError = 'Chưa đăng xuất được. Vui lòng kiểm tra kết nối và thử lại.';
          this.changeDetector.markForCheck();
        },
      });
  }

  get initials(): string {
    return this.admin.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  private readAdmin(): { name: string; role: string } {
    const fallback = { name: 'Admin', role: 'Quản trị viên' };
    try {
      const verified = this.injector.get(AdminAuthService).user;
      if (verified)
        return {
          name: verified.fullName,
          role: verified.roleName || verified.roleCode || verified.role,
        };
      const saved = JSON.parse(localStorage.getItem('adminUser') ?? 'null');
      return {
        name: saved?.fullName || saved?.name || fallback.name,
        role: saved?.roleLabel || saved?.role || fallback.role,
      };
    } catch {
      return fallback;
    }
  }
}
