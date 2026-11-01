import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { Subscription, TimeoutError } from 'rxjs';
import { SettingsService, SettingsValues, SystemSettings, settingsError } from './settings-service';

@Component({
  selector: 'app-settings',
  standalone: false,
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class Settings implements OnInit, OnDestroy {
  private service = inject(SettingsService);
  private cdr = inject(ChangeDetectorRef);
  private requests = new Subscription();
  data?: SystemSettings;
  values?: SettingsValues;
  original?: SettingsValues;
  loading = false;
  saving = false;
  error = '';
  message = '';
  active = 'general';
  cancelOpen = false;
  logoError = false;
  private reloadPending = false;
  dismissCancel() {
    this.cancelOpen = false;
    this.reloadPending = false;
  }
  requestReload() {
    if (this.dirty) {
      this.reloadPending = true;
      this.cancelOpen = true;
    } else this.load();
  }
  readonly tabs = [
    { id: 'general', icon: 'store', label: 'Cài đặt chung' },
    { id: 'payments', icon: 'card', label: 'Thanh toán' },
    { id: 'shipping', icon: 'truck', label: 'Vận chuyển' },
    { id: 'ebook', icon: 'book', label: 'Ebook' },
    { id: 'email', icon: 'mail', label: 'Email & thông báo' },
    { id: 'security', icon: 'shield', label: 'Bảo mật' },
  ];
  readonly carriers = [
    { id: 'GHN', name: 'Giao Hàng Nhanh' },
    { id: 'GHTK', name: 'Giao Hàng Tiết Kiệm' },
    { id: 'VIETTEL_POST', name: 'Viettel Post' },
    { id: 'LIGHTBOOK', name: 'Lightbook tự giao (nội thành)' },
  ];
  readonly formats = ['PDF', 'EPUB', 'MOBI'];
  readonly icons: Record<string, string> = {
    store:
      'M3 10h18l-2-6H5l-2 6Zm2 0v10h14V10M9 20v-6h6v6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0',
    card: 'M3 5h18v14H3zM3 10h18',
    truck:
      'M3 5h11v12H3zM14 9h4l3 4v4h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
    book: 'M6 3h12v18H6zM6 17h12',
    mail: 'M3 5h18v14H3zM3 5l9 7 9-7',
    shield: 'M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z',
  };
  get dirty() {
    return !!this.values && JSON.stringify(this.values) !== JSON.stringify(this.original);
  }
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.requests.unsubscribe();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty) event.preventDefault();
  }
  load() {
    if (this.saving) return;
    this.loading = true;
    this.error = '';
    this.message = '';
    this.requests.add(
      this.service.get().subscribe({
        next: (data) => {
          this.assign(data);
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.error = this.describe(e);
          this.loading = false;
          this.cdr.markForCheck();
        },
      }),
    );
  }
  private describe(error: unknown) {
    return error instanceof TimeoutError
      ? 'API Settings phản hồi quá lâu. Chưa xác nhận thay đổi đã được lưu; hãy tải lại để kiểm tra.'
      : settingsError(error as Parameters<typeof settingsError>[0]);
  }
  assign(data: SystemSettings) {
    this.data = data;
    this.values = structuredClone(data.values);
    this.original = structuredClone(data.values);
    this.logoError = false;
  }
  selectTab(id: string) {
    this.active = id;
    document
      .getElementById(`settings-${id}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  toggle(field: 'carriers' | 'formats', value: string) {
    if (!this.values || this.saving) return;
    this.values[field] = this.values[field].includes(value)
      ? this.values[field].filter((v) => v !== value)
      : [...this.values[field], value];
  }
  cancel(form: NgForm) {
    if (this.saving || !this.original) return;
    this.values = structuredClone(this.original);
    this.error = '';
    this.message = '';
    this.cancelOpen = false;
    this.logoError = false;
    form.resetForm(this.values);
    if (this.reloadPending) {
      this.reloadPending = false;
      this.load();
    }
  }
  unsupported(name: string) {
    this.message = '';
    this.error = `${name}: Backend chưa hỗ trợ thao tác này. Chưa lưu hoặc thay đổi cấu hình.`;
    document.getElementById('settings-feedback')?.scrollIntoView?.({ behavior: 'smooth' });
  }
  save(form: NgForm) {
    if (!this.values || !this.original || !this.data || this.loading || this.saving) return;
    this.error = '';
    this.message = '';
    form.control.markAllAsTouched();
    if (form.invalid) {
      this.error = 'Vui lòng kiểm tra các trường được đánh dấu trước khi lưu.';
      return;
    }
    if (this.logoError && this.values.logoUrl !== this.original.logoUrl) {
      this.error = 'Không tải được logo mới. Vui lòng kiểm tra đường dẫn ảnh trước khi lưu.';
      return;
    }
    if (!this.dirty) {
      this.message = 'Không có thay đổi để lưu.';
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(this.values).filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(this.original![key as keyof SettingsValues]),
      ),
    ) as Partial<SettingsValues>;
    this.saving = true;
    this.requests.add(
      this.service.save(changes, this.data.revision).subscribe({
        next: (data) => {
          this.assign(data);
          this.saving = false;
          this.message =
            'Đã lưu cấu hình trong MongoDB. Các hệ thống chưa tích hợp Settings chưa áp dụng thay đổi này.';
          form.form.markAsPristine();
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.error = this.describe(e);
          this.saving = false;
          this.cdr.markForCheck();
        },
      }),
    );
  }
}
