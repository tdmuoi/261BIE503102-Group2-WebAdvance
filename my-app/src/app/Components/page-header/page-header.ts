import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

import { CartService } from '../../services/cart-service';

interface NavItem {
  label: string;
  path: string;
  menu?: boolean;
}

const CLOSE_DELAY_MS = 150;

@Component({
  selector: 'app-page-header',
  standalone: false,
  styleUrl: './page-header.css',
  templateUrl: './page-header.html',
  host: { '(keydown.escape)': 'closeMenu()' },
})
export class PageHeader {
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

  protected onMenuTriggerClick(event: MouseEvent): void {
    if (this.menuOpen() || !window.matchMedia('(hover: none)').matches) return;
    event.preventDefault();
    this.openMenu();
  }

  protected onMenuFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as HTMLElement | null;
    if (!next?.closest('app-browse-menu, .nav-link-menu')) this.scheduleClose();
  }

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
