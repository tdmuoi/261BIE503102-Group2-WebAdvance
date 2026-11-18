import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

const STORAGE_KEY = 'lightbook.scroll-positions';
/** Giữ tối đa bấy nhiêu trang gần nhất (đủ dùng, sessionStorage không phình) */
const MAX_PAGES = 60;
/** Trang tải dữ liệu chậm: thử cuộn lại trong tối đa 10 giây chờ nội dung hiện đủ */
const RESTORE_TIMEOUT_MS = 10000;

/**
 * Ghi nhớ vị trí cuộn của từng trang (theo đường dẫn + query, bỏ #fragment).
 * Rời trang → lưu chỗ đang đọc. Chỉ khi quay lại bằng nút Back / Forward của trình duyệt
 * (hoặc tải lại trang - F5) thì mới cuộn về đúng chỗ cũ; bấm link chuyển trang thì luôn lên đầu trang.
 *
 * - Link có #fragment (vd. /#flashsale) vẫn do router cuộn tới đúng phần (anchorScrolling).
 * - Trang tải dữ liệu chậm: cuộn dần theo nội dung cho tới khi đủ dài, tối đa 10 giây.
 * - Người dùng tự cuộn / gõ phím, hoặc trang tự cuộn tới chỗ khác (scrollIntoView…) thì dừng ngay,
 *   không giành lại thanh cuộn.
 * - Lưu trong sessionStorage nên tải lại trang (F5) cũng giữ chỗ; đóng tab thì quên.
 *
 * Khởi tạo một lần trong App (inject(ScrollMemory)).
 */
@Injectable({ providedIn: 'root' })
export class ScrollMemory {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly positions = new Map<string, number>();
  private currentKey: string | null = null;
  private cancelRestore: (() => void) | null = null;
  /** Lần điều hướng đang chạy là do nút Back / Forward */
  private fromHistory = false;
  /** Lần điều hướng đầu tiên sau khi tải trang — nếu là F5 thì giữ chỗ cũ */
  private firstNavigation = true;

  constructor() {
    if (typeof window === 'undefined') return;
    this.load();
    // Tự xử lý thay cho trình duyệt (trình duyệt cuộn lại quá sớm, trước khi dữ liệu trang kịp tải)
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
        if (url.includes('#')) return; // để router cuộn tới #fragment
        const saved = restoreSaved ? this.positions.get(this.currentKey) ?? 0 : 0;
        this.zone.runOutsideAngular(() => this.restore(saved));
      }
    });

    // Lưu thường xuyên (để F5 / đóng tab giữa chừng vẫn nhớ), gộp 100 ms một lần cho nhẹ
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

  /** Lưu vị trí của trang đang mở */
  private remember(persist = true): void {
    if (!this.currentKey) return;
    this.positions.delete(this.currentKey); // đưa xuống cuối = mới dùng gần nhất
    this.positions.set(this.currentKey, Math.max(0, Math.round(window.scrollY)));
    while (this.positions.size > MAX_PAGES) this.positions.delete(this.positions.keys().next().value!);
    if (persist) this.save();
  }

  /** Cuộn tới y; nếu trang chưa đủ dài (đang tải dữ liệu) thì đợi và cuộn tiếp */
  private restore(target: number): void {
    this.cancelRestore?.();
    if (target <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    const started = performance.now();
    let lastSet = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Chrome tự dịch thanh cuộn khi nội dung phía trên đang tải thêm (scroll anchoring) —
    // tắt trong lúc khôi phục để không nhầm là "trang tự cuộn đi chỗ khác"
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
    // Người dùng tự cuộn / bấm / gõ phím thì thôi
    for (const type of USER_INPUT) window.addEventListener(type, stop, { passive: true, once: true });

    const step = () => {
      // Trang tự cuộn đi chỗ khác (vd. scrollIntoView tới kết quả tìm kiếm) thì nhường
      if (lastSet >= 0 && Math.abs(window.scrollY - lastSet) > 2) return stop();
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(target, max);
      window.scrollTo(0, y);
      lastSet = Math.round(window.scrollY);
      if (y >= target || performance.now() - started > RESTORE_TIMEOUT_MS) return stop();
      timer = setTimeout(step, 50);
    };
    // Chờ Angular vẽ xong trang mới rồi mới cuộn (setTimeout thay vì requestAnimationFrame để
    // vẫn chạy khi tab đang ở nền)
    timer = setTimeout(step, 0);
  }

  private load(): void {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const entries = raw ? (JSON.parse(raw) as [string, number][]) : [];
      for (const [key, y] of entries) if (typeof key === 'string' && Number.isFinite(y)) this.positions.set(key, y);
    } catch {
      // sessionStorage bị chặn / dữ liệu hỏng: chỉ nhớ trong lần mở này
    }
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...this.positions]));
    } catch {
      // bỏ qua: vẫn nhớ trong bộ nhớ
    }
  }
}

const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/** Trang vừa được tải lại bằng F5 / nút Reload */
function isReload(): boolean {
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === 'reload';
}

/** Khoá theo đường dẫn + query, bỏ #fragment */
function keyOf(url: string): string {
  const hash = url.indexOf('#');
  return hash >= 0 ? url.slice(0, hash) : url;
}
