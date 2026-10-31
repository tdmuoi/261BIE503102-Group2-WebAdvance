import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

import { CartService } from '../../services/cart-service';

interface NavItem {
  label: string;
  path: string;
  /** Mục có dropdown (Browse Book) */
  menu?: boolean;
}

/** Chờ một chút trước khi đóng dropdown để kịp rê chuột từ menu xuống bảng */
const CLOSE_DELAY_MS = 150;

@Component({
  selector: 'app-page-header',
  standalone: false,
  styleUrl: './page-header.css',
  templateUrl: './page-header.html',
  host: { '(keydown.escape)': 'closeMenu()' },
})
export class PageHeader {
  // Menu chính — đường dẫn khớp với app-routing-module.ts
  protected readonly navItems: NavItem[] = [
    { label: 'About', path: '/about-us' },
    { label: 'Browse book', path: '/books', menu: true },
    { label: 'Book buyback', path: '/book-buyback' },
    { label: 'Authors', path: '/authors' },
    { label: 'Lightbook news', path: '/news' },
  ];

  protected readonly cartCount = inject(CartService).count;

  protected readonly menuOpen = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.trackHeight());

    // Chuyển trang thì đóng dropdown
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMenu());
  }

  protected openMenu(): void {
    clearTimeout(this.closeTimer);
    this.menuOpen.set(true);
  }

  protected scheduleClose(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.menuOpen.set(false), CLOSE_DELAY_MS);
  }

  protected closeMenu(): void {
    clearTimeout(this.closeTimer);
    this.menuOpen.set(false);
  }

  /** Màn hình cảm ứng không có hover: lần chạm đầu mở dropdown thay vì chuyển trang */
  protected onMenuTriggerClick(event: MouseEvent): void {
    if (this.menuOpen() || !window.matchMedia('(hover: none)').matches) return;
    event.preventDefault();
    this.openMenu();
  }

  /** Tab ra khỏi cả nút menu lẫn bảng dropdown thì đóng */
  protected onMenuFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as HTMLElement | null;
    if (!next?.closest('app-browse-menu, .nav-link-menu')) this.scheduleClose();
  }

  /**
   * Header dính đầu trang và cao khác nhau theo màn hình (menu xuống hàng ở tablet/mobile).
   * Báo chiều cao thật cho cả trang:
   *   - scroll-padding-top: link #anchor / scrollIntoView dừng ngay dưới header, không bị che
   *   - --header-height: cho các phần tử sticky khác (sidebar lọc...) đặt top bên dưới header
   */
  private trackHeight(): void {
    if (typeof ResizeObserver === 'undefined') return;

    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      const height = `${this.host.offsetHeight}px`;
      root.style.setProperty('--header-height', height);
      root.style.scrollPaddingTop = height;
    });
    observer.observe(this.host);

    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
