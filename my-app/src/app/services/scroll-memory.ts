import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

const STORAGE_KEY = 'lightbook.scroll-positions';
const MAX_PAGES = 60;
const RESTORE_TIMEOUT_MS = 10000;

@Injectable({ providedIn: 'root' })
export class ScrollMemory {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly positions = new Map<string, number>();
  private currentKey: string | null = null;
  private cancelRestore: (() => void) | null = null;
  private fromHistory = false;
  private firstNavigation = true;

  constructor() {
    if (typeof window === 'undefined') return;
    this.load();
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.remember();
        this.fromHistory = event.navigationTrigger === 'popstate';
      } else if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects;
        this.currentKey = keyOf(url);
        const restoreSaved = this.fromHistory || (this.firstNavigation && isReload());
        this.firstNavigation = false;
        this.fromHistory = false;
        if (url.includes('#')) return;
        const saved = restoreSaved ? this.positions.get(this.currentKey) ?? 0 : 0;
        this.zone.runOutsideAngular(() => this.restore(saved));
      }
    });

    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (!this.cancelRestore) this.remember(false);
      }, 100);
    };
    const onHide = () => {
      this.remember(false);
      this.save();
    };
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('pagehide', onHide);
    });

    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onHide);
      this.cancelRestore?.();
    });
  }

  private remember(persist = true): void {
    if (!this.currentKey) return;
    this.positions.delete(this.currentKey);
    this.positions.set(this.currentKey, Math.max(0, Math.round(window.scrollY)));
    while (this.positions.size > MAX_PAGES) this.positions.delete(this.positions.keys().next().value!);
    if (persist) this.save();
  }

  private restore(target: number): void {
    this.cancelRestore?.();
    if (target <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    const started = performance.now();
    let lastSet = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const root = document.documentElement;
    const anchorBefore = root.style.overflowAnchor;
    root.style.overflowAnchor = 'none';

    const stop = () => {
      clearTimeout(timer);
      for (const type of USER_INPUT) window.removeEventListener(type, stop);
      root.style.overflowAnchor = anchorBefore;
      if (this.cancelRestore === stop) this.cancelRestore = null;
    };
    this.cancelRestore = stop;
    for (const type of USER_INPUT) window.addEventListener(type, stop, { passive: true, once: true });

    const step = () => {
      if (lastSet >= 0 && Math.abs(window.scrollY - lastSet) > 2) return stop();
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(target, max);
      window.scrollTo(0, y);
      lastSet = Math.round(window.scrollY);
      if (y >= target || performance.now() - started > RESTORE_TIMEOUT_MS) return stop();
      timer = setTimeout(step, 50);
    };
    timer = setTimeout(step, 0);
  }

  private load(): void {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const entries = raw ? (JSON.parse(raw) as [string, number][]) : [];
      for (const [key, y] of entries) if (typeof key === 'string' && Number.isFinite(y)) this.positions.set(key, y);
    } catch {
    }
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...this.positions]));
    } catch {
    }
  }
}

const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

function isReload(): boolean {
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === 'reload';
}

function keyOf(url: string): string {
  const hash = url.indexOf('#');
  return hash >= 0 ? url.slice(0, hash) : url;
}
