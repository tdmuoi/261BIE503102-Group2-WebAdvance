import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { Banner, BannerErrors, BannerPayload, BannerPosition, POSITION_LABELS } from '../../../models/banner';
import { BannerService } from '../../../services/banner-service';

/** ISO -> 'YYYY-MM-DD' theo giờ Việt Nam (cho <input type="date">) */
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Hộp thoại Thêm / Sửa banner (dùng trong trang Banners), có xem trước trực tiếp.
 *   <app-banner-form [banner]="null" position="hero" (saved)="..." (closed)="..." (deleteRequested)="..."></app-banner-form>
 * - banner = null  -> thêm mới ở vị trí `position`
 * - banner có giá trị -> sửa banner đó
 */
@Component({
  selector: 'app-banner-form',
  standalone: false,
  styleUrl: './banner-form.css',
  templateUrl: './banner-form.html',
})
export class BannerForm implements OnInit {
  private readonly bannerService = inject(BannerService);

  @Input() banner: Banner | null = null;
  @Input() position: BannerPosition = 'hero';
  /** true khi đang có hộp thoại khác đè lên (vd xác nhận xoá) -> Esc không đóng form */
  @Input() paused = false;

  @Output() saved = new EventEmitter<Banner>();
  @Output() closed = new EventEmitter<void>();
  @Output() deleteRequested = new EventEmitter<Banner>();

  readonly positionLabels = POSITION_LABELS;
  readonly positions = Object.keys(POSITION_LABELS) as BannerPosition[];
  readonly colorPresets = ['#1c1917', '#f2b8b5', '#5b8f84', '#ffd8eb', '#d8f0ed', '#fef9c3'];

  readonly saving = signal(false);
  readonly errors = signal<BannerErrors>({});
  readonly imageBroken = signal(false);

  form: BannerPayload = {
    name: '', title: '', subtitle: 'lightbooks.vn', image: '', link: '',
    bgColor: '#1c1917', textColor: '#ffffff', position: 'hero', active: true, startDate: '', endDate: '',
  };

  ngOnInit(): void {
    const b = this.banner;
    this.form = b
      ? {
          name: b.name, title: b.title, subtitle: b.subtitle, image: b.image ?? '', link: b.link,
          bgColor: b.bgColor, textColor: b.textColor, position: b.position, active: b.active,
          startDate: toDateInput(b.startDate), endDate: toDateInput(b.endDate),
        }
      : { ...this.form, position: this.position };
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  /** Bấm ra vùng nền mờ bên ngoài hộp thoại thì đóng.
   *  (Viết thành hàm: biểu thức trả về false trong (click) sẽ chặn luôn nút submit của form) */
  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (!this.paused) this.close();
  }

  validate(): BannerErrors {
    const f = this.form;
    const e: BannerErrors = {};
    if (!f.name.trim()) e.name = 'Vui lòng đặt tên banner';
    if (!f.title.trim() && !f.image.trim()) e.title = 'Cần có tiêu đề hoặc ảnh banner';
    if (f.image.trim() && !/^(https?:\/\/|\/|images\/)/i.test(f.image.trim())) e.image = 'Link ảnh phải bắt đầu bằng http(s):// hoặc /';
    if (f.link.trim() && !/^(https?:\/\/|\/)/i.test(f.link.trim())) e.link = 'Link phải bắt đầu bằng / hoặc http(s)://';
    if (f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = 'Ngày kết thúc phải sau ngày bắt đầu';
    return e;
  }

  /** Sửa ô nào thì xoá lỗi của ô đó */
  clearError(field: string): void {
    const key = field as keyof BannerErrors;
    if (!this.errors()[key]) return;
    const next = { ...this.errors() };
    delete next[key];
    this.errors.set(next);
  }

  save(): void {
    const errors = this.validate();
    this.errors.set(errors);
    if (Object.keys(errors).length) return;

    this.saving.set(true);
    const request: Observable<Banner> = this.banner
      ? this.bannerService.updateBanner(this.banner._id, this.form)
      : this.bannerService.createBanner(this.form);
    request.subscribe({
      next: (b) => {
        this.saving.set(false);
        this.saved.emit(b);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        if (err.status === 400 && err.error?.errors) this.errors.set(err.error.errors);
        else
          this.errors.set({
            name: err.status === 0 ? 'Không kết nối được my-server (http://localhost:3002)' : err.error?.message || 'Lưu banner thất bại',
          });
      },
    });
  }
}
