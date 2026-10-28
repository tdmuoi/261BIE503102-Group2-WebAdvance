import { Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-page-header',
  standalone: false,
  styleUrl: './page-header.css',
  templateUrl: './page-header.html',
})
export class PageHeader {
  // Menu chính — đường dẫn khớp với app-routing-module.ts
  protected readonly navItems: NavItem[] = [
    { label: 'About', path: '/about-us' },
    { label: 'Browse book', path: '/browse-book' },
    { label: 'Book buyback', path: '/book-buyback' },
    { label: 'Authors', path: '/author-list' },
    { label: 'Lightbook news', path: '/news-list' },
  ];

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.trackHeight());
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
