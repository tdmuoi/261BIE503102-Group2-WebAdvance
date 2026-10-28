import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { Banner, BannerListResponse, BannerPosition, BannerState, POSITION_LABELS } from '../../models/banner';
import { BannerService } from '../../services/banner-service';

const STATE_BADGE: Record<BannerState, { status: string; label: string }> = {
  live: { status: 'active', label: 'Đang hiển thị' },
  scheduled: { status: 'scheduled', label: 'Lên lịch' },
  expired: { status: 'expired', label: 'Hết hạn' },
  off: { status: 'hidden', label: 'Đã tắt' },
};

/**
 * Trang Banner & quảng cáo: xem banner theo vị trí, bật/tắt, đổi thứ tự hiển thị, xoá (hỏi lại bằng
 * app-confirm-dialog). Thêm/sửa nằm trong hộp thoại riêng: ./banner-form
 * Web khách lấy banner đang chạy qua GET /api/banners?position=hero
 */
@Component({
  selector: 'app-banners',
  standalone: false,
  styleUrl: './banners.css',
  templateUrl: './banners.html',
})
export class Banners {
  private readonly bannerService = inject(BannerService);

  readonly positionLabels = POSITION_LABELS;
  readonly positions = Object.keys(POSITION_LABELS) as BannerPosition[];
  readonly stateFilters: { value: '' | BannerState; label: string }[] = [
    { value: '', label: 'Mọi trạng thái' },
    { value: 'live', label: 'Đang hiển thị' },
    { value: 'scheduled', label: 'Lên lịch' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'off', label: 'Đã tắt' },
  ];

  readonly data = signal<BannerListResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly flash = signal('');
  readonly busyId = signal('');

  readonly positionFilter = signal<'' | BannerPosition>('');
  readonly stateFilter = signal<'' | BannerState>('');

  /** Các nhóm banner theo vị trí, đã lọc theo trạng thái */
  readonly groups = computed(() => {
    const items = this.data()?.items ?? [];
    const shown = this.positionFilter() ? [this.positionFilter() as BannerPosition] : this.positions;
    return shown.map((position) => {
      const all = items.filter((b) => b.position === position);
      return {
        position,
        label: POSITION_LABELS[position],
        all,
        items: this.stateFilter() ? all.filter((b) => b.state === this.stateFilter()) : all,
      };
    });
  });

  // Hộp thoại thêm/sửa + xác nhận xoá
  readonly formOpen = signal(false);
  readonly editing = signal<Banner | null>(null);
  readonly createPosition = signal<BannerPosition>('hero');
  readonly deleting = signal<Banner | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.bannerService.getBanners().subscribe({
      next: (res) => {
        this.data.set(res);
        this.error.set('');
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(this.message(err, 'Không tải được danh sách banner.'));
        this.loading.set(false);
      },
    });
  }

  // ---------- Hiển thị ----------
  badge(b: Banner): { status: string; label: string } {
    return STATE_BADGE[b.state] ?? STATE_BADGE.off;
  }

  /** "Luôn hiển thị" | "10/10 – 12/10/2026" | "Từ 20/01/2027" | "Đến 31/10/2026" */
  schedule(b: Pick<Banner, 'startDate' | 'endDate'>): string {
    // Đổi sang giờ Việt Nam (UTC+7) rồi ghép dd/MM(/yyyy)
    const fmt = (iso: string, year: boolean) => {
      const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      return year ? `${dd}/${mm}/${d.getUTCFullYear()}` : `${dd}/${mm}`;
    };
    if (b.startDate && b.endDate) return `${fmt(b.startDate, false)} – ${fmt(b.endDate, true)}`;
    if (b.startDate) return `Từ ${fmt(b.startDate, true)}`;
    if (b.endDate) return `Đến ${fmt(b.endDate, true)}`;
    return 'Luôn hiển thị';
  }

  // ---------- Thêm / sửa ----------
  openCreate(position: BannerPosition = 'hero'): void {
    this.editing.set(null);
    this.createPosition.set(position);
    this.formOpen.set(true);
  }

  openEdit(b: Banner): void {
    this.editing.set(b);
    this.formOpen.set(true);
  }

  onSaved(b: Banner): void {
    this.showFlash(`${this.editing() ? 'Đã lưu' : 'Đã thêm'} banner "${b.name}"`);
    this.formOpen.set(false);
    this.load();
  }

  // ---------- Bật/tắt, thứ tự ----------
  toggle(b: Banner): void {
    this.busyId.set(b._id);
    this.bannerService.setActive(b._id, !b.active).subscribe({
      next: () => {
        this.busyId.set('');
        this.showFlash(`Đã ${b.active ? 'tắt' : 'bật'} banner "${b.name}"`);
        this.load();
      },
      error: (err: HttpErrorResponse) => this.fail(err, 'Không đổi được trạng thái banner.'),
    });
  }

  /** Đổi chỗ với banner đứng trước (-1) hoặc sau (+1) trong cùng vị trí */
  move(b: Banner, step: -1 | 1): void {
    const items = this.data()?.items ?? [];
    const list = items.filter((x) => x.position === b.position);
    const from = list.findIndex((x) => x._id === b._id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];

    // Đổi ngay trên màn hình rồi mới lưu
    const others = items.filter((x) => x.position !== b.position);
    this.data.update((d) => (d ? { ...d, items: [...others, ...list.map((x, i) => ({ ...x, order: i + 1 }))] } : d));
    this.busyId.set(b._id);
    this.bannerService.reorder(list.map((x) => x._id)).subscribe({
      next: () => {
        this.busyId.set('');
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.fail(err, 'Không lưu được thứ tự banner.');
        this.load();
      },
    });
  }

  // ---------- Xoá ----------
  confirmDelete(): void {
    const b = this.deleting();
    if (!b) return;
    this.busyId.set(b._id);
    this.bannerService.deleteBanner(b._id).subscribe({
      next: () => {
        this.busyId.set('');
        this.deleting.set(null);
        this.formOpen.set(false);
        this.showFlash(`Đã xoá banner "${b.name}"`);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(null);
        this.fail(err, 'Xoá banner thất bại.');
      },
    });
  }

  // ---------- Hàm phụ ----------
  private showFlash(text: string): void {
    this.flash.set(text);
    setTimeout(() => this.flash() === text && this.flash.set(''), 4000);
  }

  private fail(err: HttpErrorResponse, fallback: string): void {
    this.busyId.set('');
    this.error.set(this.message(err, fallback));
  }

  private message(err: HttpErrorResponse, fallback: string): string {
    return err.status === 0
      ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
      : err.error?.message || fallback;
  }
}
