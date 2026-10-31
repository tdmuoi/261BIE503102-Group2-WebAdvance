import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NgForm } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  DiscountType,
  Voucher,
  VoucherCounts,
  VoucherPayload,
  VoucherReportResponse,
  VoucherStatus,
  VoucherSummary,
} from '../../models/voucher';
import { VoucherService } from '../../services/voucher-service';

@Component({
  selector: 'app-vouchers',
  standalone: false,
  styleUrl: './vouchers.css',
  templateUrl: './vouchers.html',
})
export class Vouchers implements OnInit, OnDestroy {
  @ViewChild('voucherForm') voucherForm?: NgForm;
  readonly categories = ['Sách mới', 'Sách cũ', 'Sách điện tử'];
  readonly filters: { key: 'all' | VoucherStatus; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'active', label: 'Đang chạy' },
    { key: 'scheduled', label: 'Lên lịch' },
    { key: 'expired', label: 'Hết hạn' },
    { key: 'paused', label: 'Tạm dừng' },
  ];
  vouchers: Voucher[] = [];
  counts: VoucherCounts = { all: 0, active: 0, paused: 0, scheduled: 0, expired: 0 };
  summary: VoucherSummary | null = null;
  report: VoucherReportResponse | null = null;
  total = 0;
  search = '';
  filter: 'all' | VoucherStatus = 'all';
  page = 1;
  readonly pageSize = 6;
  formOpen = true;
  editingId: string | null = null;
  draft = this.emptyDraft();
  errors: string[] = [];
  message = '';
  apiError = '';
  dataNote = '';
  reportError = '';
  menuId: string | null = null;
  reportOpen = false;
  loading = false;
  loaded = false;
  loadingDetail = false;
  saving = false;
  exporting = false;
  reportLoading = false;
  changingId: string | null = null;
  private listRequest?: Subscription;
  private detailRequest?: Subscription;
  private readonly requests = new Subscription();
  private destroyed = false;

  constructor(private readonly service: VoucherService) {}
  ngOnInit(): void {
    this.loadVouchers();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.listRequest?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.requests.unsubscribe();
  }

  private emptyDraft(): VoucherPayload & { used: number } {
    const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    return {
      code: '',
      name: '',
      description: '',
      type: 'percent',
      value: 15,
      maxDiscount: 50000,
      minOrder: 150000,
      limit: 300,
      perCustomer: 1,
      start,
      end: start,
      categories: [],
      newOnly: false,
      suggest: false,
      used: 0,
      paused: false,
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if ([401, 403].includes(error.status))
        return 'Phiên hết hạn hoặc không có quyền quản trị. Vui lòng đăng nhập lại tại trang Login.';
      if (error.status === 0)
        return 'Không kết nối được Backend. Kiểm tra server và mạng rồi thử lại.';
      if (error.status === 404)
        return 'Không tìm thấy API hoặc voucher. Kiểm tra đăng ký route Vouchers trên Backend.';
      if (error.status === 503) return 'Cơ sở dữ liệu đang không khả dụng. Vui lòng thử lại.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return 'Không xử lý được yêu cầu. Vui lòng thử lại.';
  }

  loadVouchers(): void {
    this.listRequest?.unsubscribe();
    this.loading = true;
    this.apiError = '';
    this.menuId = null;
    this.vouchers = [];
    this.listRequest = this.service
      .getVouchers({
        q: this.search.trim(),
        status: this.filter,
        page: this.page,
        limit: this.pageSize,
      })
      .subscribe({
        next: (response) => {
          this.vouchers = response.items;
          this.total = response.total;
          this.page = response.page;
          this.counts = response.counts;
          this.summary = response.summary;
          this.dataNote = response.dataNote ?? '';
          this.loaded = true;
          this.loading = false;
        },
        error: (error: unknown) => {
          this.loading = false;
          this.loaded = false;
          this.total = 0;
          this.summary = null;
          this.apiError = this.errorMessage(error);
        },
      });
  }
  searchChanged(): void {
    this.page = 1;
    this.loadVouchers();
  }
  changePage(page: number): void {
    this.page = page;
    this.loadVouchers();
  }
  selectFilter(key: 'all' | VoucherStatus): void {
    this.filter = key;
    this.page = 1;
    this.loadVouchers();
  }
  status(v: Voucher): VoucherStatus {
    return v.state;
  }
  statusLabel(v: Voucher): string {
    return this.filters.find((f) => f.key === v.state)?.label ?? 'Không xác định';
  }
  count(key: 'all' | VoucherStatus): number | string {
    return this.loaded ? this.counts[key] : '—';
  }
  get rows(): Voucher[] {
    return this.vouchers;
  }
  get leaders() {
    return this.report?.items.slice(0, 4) ?? [];
  }
  get totalRevenue(): number | null {
    return this.summary?.revenue ?? null;
  }
  get totalUses(): number | null {
    return this.summary?.totalUses ?? null;
  }
  get totalDiscount(): number | null {
    return this.summary?.discount ?? null;
  }
  get expiring(): number | string {
    return this.summary?.expiring ?? '—';
  }
  money(n: number | null): string {
    return n === null ? 'Chưa có dữ liệu' : Number(n || 0).toLocaleString('vi-VN') + 'đ';
  }
  million(n: number | null): string {
    return n === null
      ? '—'
      : (n / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  }
  date(s: string): string {
    return s ? s.split('-').reverse().join('/') : '—';
  }
  typeLabel(type: DiscountType): string {
    return type === 'percent' ? 'Phần trăm' : type === 'amount' ? 'Số tiền' : 'Freeship';
  }
  valueLabel(v: Pick<VoucherPayload, 'type' | 'value'>): string {
    return v.type === 'percent' ? v.value + '%' : this.money(v.value);
  }
  progress(v: Voucher): number {
    return v.limit > 0 ? Math.max(0, Math.min(100, (v.used / v.limit) * 100)) : 0;
  }

  openForm(v?: Voucher): void {
    if (this.saving) return;
    this.detailRequest?.unsubscribe();
    this.editingId = v?._id ?? null;
    this.draft = v ? { ...v, categories: [...v.categories] } : this.emptyDraft();
    this.errors = [];
    this.voucherForm?.resetForm(this.draft);
    this.formOpen = true;
    this.menuId = null;
    this.loadingDetail = !!v;
    if (v) {
      this.detailRequest = this.service.getVoucher(v._id).subscribe({
        next: (voucher) => {
          this.draft = { ...voucher, categories: [...voucher.categories] };
          this.voucherForm?.resetForm(this.draft);
          this.loadingDetail = false;
        },
        error: (error: unknown) => {
          this.loadingDetail = false;
          this.formOpen = false;
          this.message = this.errorMessage(error);
        },
      });
    }
  }
  closeForm(): void {
    if (this.saving) return;
    this.detailRequest?.unsubscribe();
    this.loadingDetail = false;
    this.formOpen = false;
    this.errors = [];
  }
  randomCode(): void {
    this.draft.code = 'LIGHT' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  toggleCategory(category: string): void {
    this.message = 'Schema MongoDB hiện chưa hỗ trợ giới hạn theo nhóm sách.';
  }
  save(form: NgForm): void {
    if (this.saving || this.loadingDetail) return;
    form.control.markAllAsTouched();
    const v = this.draft;
    const code = v.code.trim().toUpperCase();
    this.errors = [];
    if (!v.name?.trim() || v.name.trim().length > 120)
      this.errors.push('Tên ưu đãi từ 1 đến 120 ký tự.');
    if (form.invalid || !/^[A-Z0-9_-]{3,24}$/.test(code))
      this.errors.push(
        'Nhập đầy đủ các trường hợp hợp lệ. Mã gồm 3–24 chữ không dấu, số, _ hoặc -.',
      );
    if (this.vouchers.some((x) => x._id !== this.editingId && x.code === code))
      this.errors.push('Mã giảm giá đã tồn tại.');
    if (
      !Number.isFinite(v.value) ||
      v.value < 1 ||
      (v.type === 'percent' && v.value > 100) ||
      (v.type !== 'percent' && !Number.isSafeInteger(v.value))
    )
      this.errors.push('Phần trăm từ 1 đến 100%; số tiền phải là số nguyên VND từ 1 trở lên.');
    if (
      ![v.limit, v.perCustomer].every((n) => Number.isSafeInteger(n) && n > 0) ||
      v.limit < v.used ||
      v.perCustomer > v.limit
    )
      this.errors.push(
        'Lượt dùng phải là số nguyên dương, tổng lượt không nhỏ hơn lượt đã dùng và lượt mỗi khách.',
      );
    if (![v.minOrder, v.maxDiscount].every((n) => Number.isSafeInteger(n) && n >= 0))
      this.errors.push('Số tiền tối thiểu và giảm tối đa phải là số nguyên VND từ 0 trở lên.');
    const validDay = (day: string): boolean => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      const parsed = new Date(`${day}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
    };
    if (!validDay(v.start) || !validDay(v.end) || v.end < v.start)
      this.errors.push('Ngày phải hợp lệ; ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
    if (v.categories.length || v.newOnly || v.suggest)
      this.errors.push('Schema hiện chưa hỗ trợ nhóm sách, khách hàng mới hoặc gợi ý giỏ hàng.');
    if (this.errors.length) return;
    // Explicit whitelist: never send used, state, IDs, or revenue from the Admin form.
    const payload: VoucherPayload = {
      code,
      name: v.name?.trim(),
      description: v.description,
      type: v.type,
      value: v.value,
      maxDiscount: v.maxDiscount,
      minOrder: v.minOrder,
      limit: v.limit,
      perCustomer: v.perCustomer,
      start: v.start,
      end: v.end,
      categories: [...v.categories],
      newOnly: v.newOnly,
      suggest: v.suggest,
      paused: false,
    };
    this.saving = true;
    const request = this.editingId
      ? this.service.updateVoucher(this.editingId, payload)
      : this.service.createVoucher(payload);
    this.requests.add(
      request.subscribe({
        next: (saved) => {
          this.saving = false;
          this.formOpen = false;
          this.search = '';
          this.filter = 'all';
          this.page = 1;
          this.message = `Đã lưu ${saved.code} vào cơ sở dữ liệu.`;
          this.loadVouchers();
        },
        error: (error: unknown) => {
          this.saving = false;
          this.errors = [this.errorMessage(error)];
          if (
            error instanceof HttpErrorResponse &&
            error.error?.errors &&
            typeof error.error.errors === 'object'
          ) {
            for (const value of Object.values(error.error.errors)) {
              if (typeof value === 'string') this.errors.push(value);
            }
          }
        },
      }),
    );
  }
  toggleStatus(v: Voucher): void {
    if (this.changingId || this.saving) return;
    this.menuId = null;
    if (v.state === 'expired') {
      this.message = 'Mã đã hết hạn hoặc hết lượt. Hãy sửa thời gian / giới hạn để kích hoạt lại.';
      return;
    }
    this.changingId = v._id;
    this.requests.add(
      this.service.setPaused(v._id, !v.paused).subscribe({
        next: (saved) => {
          this.changingId = null;
          this.message = `${saved.code}: ${this.statusLabel(saved)}.`;
          this.loadVouchers();
        },
        error: (error: unknown) => {
          this.changingId = null;
          this.message = this.errorMessage(error);
          this.loadVouchers();
        },
      }),
    );
  }
  openReport(): void {
    this.reportOpen = true;
    this.reportLoading = true;
    this.reportError = '';
    this.report = null;
    this.requests.add(
      this.service.getReport().subscribe({
        next: (report) => {
          this.report = report;
          this.reportLoading = false;
        },
        error: (error: unknown) => {
          this.reportError = this.errorMessage(error);
          this.reportLoading = false;
        },
      }),
    );
  }
  async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.message = `Đã sao chép ${code}.`;
    } catch {
      this.message = `Không thể truy cập clipboard. Hãy sao chép mã: ${code}`;
    }
  }
  async exportCsv(): Promise<void> {
    if (this.exporting) return;
    this.exporting = true;
    const query = { q: this.search.trim(), status: this.filter, limit: 100 };
    try {
      const items: Voucher[] = [];
      let total = 0;
      for (let page = 1; page === 1 || items.length < total; page++) {
        const response = await firstValueFrom(this.service.getVouchers({ ...query, page }));
        if (this.destroyed) return;
        if (
          response.page !== page ||
          (page > 1 && (response.total !== total || !response.items.length))
        )
          throw new Error('Danh sách thay đổi khi xuất.');
        total = response.total;
        items.push(...response.items);
      }
      if (new Set(items.map((v) => v._id)).size !== items.length)
        throw new Error('Danh sách thay đổi khi xuất.');
      const fields = [
        'Mã',
        'Mô tả',
        'Loại',
        'Giá trị',
        'Đã dùng',
        'Giới hạn',
        'Bắt đầu',
        'Kết thúc',
        'Trạng thái',
      ];
      const lines = items.map((v) => [
        v.code,
        v.description,
        this.typeLabel(v.type),
        v.value,
        v.used,
        v.limit,
        v.start,
        v.end,
        this.statusLabel(v),
      ]);
      const escape = (x: unknown) =>
        '"' +
        String(x)
          .replace(/^[=+@\-\t\r]/, "'$&")
          .replace(/"/g, '""') +
        '"';
      const blob = new Blob(
        ['\uFEFF' + [fields, ...lines].map((row) => row.map(escape).join(',')).join('\r\n')],
        { type: 'text/csv;charset=utf-8;' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lightbook-vouchers.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message = `Đã xuất ${items.length} mã theo bộ lọc hiện tại.`;
    } catch (error) {
      if (!this.destroyed)
        this.message =
          error instanceof Error && error.message === 'Danh sách thay đổi khi xuất.'
            ? 'Danh sách đã thay đổi trong lúc xuất CSV. Vui lòng thử lại.'
            : this.errorMessage(error);
    } finally {
      this.exporting = false;
    }
  }
}
