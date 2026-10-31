import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, debounceTime, forkJoin, catchError, map, of } from 'rxjs';
import { NgForm } from '@angular/forms';

import {
  AccountQuery,
  AccountTab,
  AdminAccount,
  AdminAccountRequest,
  AdminList,
  CustomerAccount,
  CustomerAccountDetail,
  CustomerList,
} from '../../models/account-management';
import { AccountManagementService } from '../../services/account-management-service';
import { AdminAuthService } from '../../services/admin-auth-service';

@Component({
  selector: 'app-accounts',
  standalone: false,
  styleUrl: './accounts.css',
  templateUrl: './accounts.html',
})
export class Accounts {
  readonly auth = inject(AdminAuthService);
  private readonly accountsService = inject(AccountManagementService);
  private readonly search$ = new Subject<{ value: string; version: number }>();
  private searchVersion = 0;
  private listRequest?: Subscription;
  private detailRequest?: Subscription;
  private readonly requests = new Subscription();
  readonly detailLoading = signal(false);
  readonly message = signal('');
  readonly editorError = signal('');
  readonly roleFilter = signal('');
  readonly confirmAction = signal<{
    kind: 'customer' | 'admin';
    id: string;
    name: string;
    action: 'lock' | 'unlock';
  } | null>(null);

  readonly tab = signal<AccountTab>('customers');
  readonly q = signal('');
  readonly tier = signal('');
  readonly status = signal('');
  readonly page = signal(1);
  readonly pageSize = 7;
  readonly customers = signal<CustomerList | null>(null);
  readonly admins = signal<AdminList | null>(null);
  readonly selectedCustomer = signal<CustomerAccountDetail | null>(null);
  readonly selectedAdmin = signal<AdminAccount | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly editorOpen = signal(false);
  readonly roleEditorOpen = signal(false);
  readonly permissionEditing = signal(false);
  readonly roleCode = signal('');
  readonly roleName = signal('');
  readonly roleDescription = signal('');
  readonly pendingInvite = signal(false);
  readonly editName = signal('');
  readonly editEmail = signal('');
  readonly editRole = signal('');
  readonly editStatus = signal('');
  readonly dirtyPermissions = signal<Record<string, string[]>>({});

  readonly customerItems = computed(() => this.customers()?.items ?? []);
  readonly adminItems = computed(() => this.admins()?.items ?? []);
  readonly total = computed(() =>
    this.tab() === 'customers' ? (this.customers()?.total ?? 0) : (this.admins()?.total ?? 0),
  );
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly hasPermissionChanges = computed(() => Object.keys(this.dirtyPermissions()).length > 0);

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(({ value, version }) => {
      if (version !== this.searchVersion) return;
      this.q.set(value);
      this.page.set(1);
      this.load();
    });
    this.load();
  }

  setTab(tab: AccountTab): void {
    if (this.tab() === tab || this.saving()) return;
    this.searchVersion++;
    this.tab.set(tab);
    this.q.set('');
    this.tier.set('');
    this.status.set('');
    this.roleFilter.set('');
    this.editorOpen.set(false);
    this.roleEditorOpen.set(false);
    this.cancelPermissionEdit();
    this.selectedCustomer.set(null);
    this.selectedAdmin.set(null);
    this.page.set(1);
    this.load();
  }

  inviteAdmin(): void {
    if (this.admins()) {
      this.setTab('admins');
      this.openAdminEditor();
      return;
    }
    this.pendingInvite.set(true);
    if (this.tab() === 'admins') this.load();
    else this.setTab('admins');
  }

  onSearch(value: string): void {
    this.q.set(value);
    this.search$.next({ value: value.trim(), version: ++this.searchVersion });
  }

  setFilter(name: 'tier' | 'status', value: string): void {
    this.searchVersion++;
    if (name === 'tier') this.tier.set(value);
    else this.status.set(value);
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  load(): void {
    this.listRequest?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.selectedCustomer.set(null);
    this.detailLoading.set(false);
    this.loading.set(true);
    this.error.set('');
    const query: AccountQuery = {
      q: this.q().trim(),
      tier: this.tier(),
      status: this.status(),
      roleId: this.roleFilter(),
      page: this.page(),
      limit: this.pageSize,
    };
    const handleError = (err: HttpErrorResponse) => {
      this.error.set(this.describeError(err));
      this.page.set(1);
      if (this.tab() === 'customers') this.customers.set(null);
      else this.admins.set(null);
      this.pendingInvite.set(false);
      this.loading.set(false);
    };
    if (this.tab() === 'customers') {
      this.listRequest = this.accountsService.getCustomers(query).subscribe({
        next: (result) => {
          this.customers.set(result);
          this.page.set(result.page);
          this.loading.set(false);
          const selected = this.selectedCustomer();
          if (!selected || !result.items.some((customer) => customer._id === selected._id)) {
            const first = result.items[0];
            if (first) this.selectCustomer(first);
            else {
              this.selectedCustomer.set(null);
              this.loading.set(false);
            }
          } else this.loading.set(false);
        },
        error: handleError,
      });
    } else {
      this.listRequest = this.accountsService.getAdmins(query).subscribe({
        next: (result) => {
          this.admins.set(result);
          this.page.set(result.page);
          this.loading.set(false);
          if (this.pendingInvite()) {
            this.pendingInvite.set(false);
            this.openAdminEditor();
          }
        },
        error: handleError,
      });
    }
  }

  selectCustomer(customer: CustomerAccount): void {
    this.detailRequest?.unsubscribe();
    this.selectedCustomer.set(null);
    this.detailLoading.set(true);
    this.detailRequest = this.accountsService.getCustomer(customer._id).subscribe({
      next: (detail) => {
        this.selectedCustomer.set(detail);
        this.detailLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(this.describeError(err));
        this.detailLoading.set(false);
      },
    });
  }

  closeCustomer(): void {
    this.detailRequest?.unsubscribe();
    this.detailLoading.set(false);
    this.selectedCustomer.set(null);
  }

  openAdminEditor(admin: AdminAccount | null = null): void {
    if (this.saving()) return;
    this.editorError.set('');
    this.selectedAdmin.set(admin);
    this.editName.set(admin?.fullName ?? '');
    this.editEmail.set(admin?.email ?? '');
    this.editRole.set(
      admin?.roleId ??
        this.admins()?.roles.roles.find((role) => role.code !== 'superadmin')?._id ??
        '',
    );
    this.editStatus.set(admin?.status ?? this.admins()?.statuses[0]?.value ?? '');
    this.editorOpen.set(true);
  }

  saveAdmin(form?: NgForm): void {
    if (this.saving()) return;
    form?.control.markAllAsTouched();
    this.editorError.set('');
    const body: AdminAccountRequest = {
      fullName: this.editName().trim(),
      email: this.editEmail().trim(),
      roleId: this.editRole(),
      status: this.editStatus(),
    };
    if (
      form?.invalid ||
      !body.fullName ||
      body.fullName.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      body.email.length > 254 ||
      !body.roleId
    ) {
      this.editorError.set('Nhập họ tên, email hợp lệ và chọn vai trò.');
      return;
    }
    this.saving.set(true);
    const current = this.selectedAdmin();
    const request = current
      ? this.accountsService.updateAdmin(current._id, body)
      : this.accountsService.createAdmin(body);
    this.requests.add(
      request.subscribe({
        next: () => {
          this.editorOpen.set(false);
          this.saving.set(false);
          this.message.set('Đã lưu thông tin quản trị viên.');
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.editorError.set(this.describeError(err));
          this.saving.set(false);
        },
      }),
    );
  }

  removeAdmin(admin: AdminAccount): void {
    if (admin.protected || admin.isSelf) {
      this.error.set('Không thay đổi quyền truy cập của bản thân hoặc Super Admin.');
      return;
    }
    this.confirmAction.set({
      kind: 'admin',
      id: admin._id,
      name: admin.fullName,
      action: admin.status === 'locked' ? 'unlock' : 'lock',
    });
  }

  togglePermission(roleId: string, permissionId: string): void {
    const current = this.dirtyPermissions()[roleId] ?? this.admins()?.roles.grants[roleId] ?? [];
    const next = current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId];
    this.dirtyPermissions.set({ ...this.dirtyPermissions(), [roleId]: next });
  }

  hasPermission(roleId: string, permissionId: string): boolean {
    return (this.dirtyPermissions()[roleId] ?? this.admins()?.roles.grants[roleId] ?? []).includes(
      permissionId,
    );
  }

  savePermissions(): void {
    if (this.saving() || !this.admins()?.capabilities.roles) return;
    const changes = Object.entries(this.dirtyPermissions());
    if (!changes.length) return;
    this.saving.set(true);
    this.requests.add(
      forkJoin(
        changes.map(([roleId, permissionIds]) =>
          this.accountsService.updateRolePermissions(roleId, permissionIds).pipe(
            map(() => ({ roleId, permissionIds, error: '' })),
            catchError((err: HttpErrorResponse) =>
              of({ roleId, permissionIds, error: this.describeError(err) }),
            ),
          ),
        ),
      ).subscribe((results) => {
        const failed: Record<string, string[]> = {};
        const data = this.admins();
        const grants = { ...data?.roles.grants };
        results.forEach((result) => {
          if (result.error) failed[result.roleId] = result.permissionIds;
          else grants[result.roleId] = result.permissionIds;
        });
        if (data) this.admins.set({ ...data, roles: { ...data.roles, grants } });
        this.dirtyPermissions.set(failed);
        this.saving.set(false);
        this.permissionEditing.set(Object.keys(failed).length > 0);
        this.message.set(
          `Đã lưu ${results.length - Object.keys(failed).length}/${results.length} vai trò. Quyền trên các API khác cần được tích hợp riêng.`,
        );
        this.error.set(
          results
            .filter((result) => result.error)
            .map((result) => result.error)
            .join(' '),
        );
      }),
    );
  }

  beginPermissionEdit(): void {
    if (!this.admins()?.capabilities.roles || this.saving()) return;
    this.dirtyPermissions.set({});
    this.permissionEditing.set(true);
  }

  cancelPermissionEdit(): void {
    this.dirtyPermissions.set({});
    this.permissionEditing.set(false);
  }

  openRoleEditor(): void {
    this.roleCode.set('');
    this.roleName.set('');
    this.roleDescription.set('');
    this.roleEditorOpen.set(true);
  }

  createRole(): void {
    if (this.saving()) return;
    this.editorError.set('');
    const body = {
      code: this.roleCode().trim(),
      name: this.roleName().trim(),
      description: this.roleDescription().trim(),
    };
    if (
      !/^[a-z][a-z0-9_-]{2,39}$/.test(body.code) ||
      !body.name ||
      body.name.length > 100 ||
      body.description.length > 500
    ) {
      this.editorError.set(
        'Mã vai trò 3–40 ký tự thường, tên tối đa 100 và mô tả tối đa 500 ký tự.',
      );
      return;
    }
    this.saving.set(true);
    this.requests.add(
      this.accountsService.createRole(body).subscribe({
        next: () => {
          this.saving.set(false);
          this.roleEditorOpen.set(false);
          this.message.set('Đã lưu vai trò.');
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.editorError.set(this.describeError(err));
          this.saving.set(false);
        },
      }),
    );
  }

  updateSecurity(
    name: 'requireTwoFactor' | 'forcePasswordRotation' | 'restrictOfficeIp',
    value: boolean,
  ): void {
    this.error.set(
      'Chưa có cơ chế thực thi cài đặt này trên Backend. Không lưu thay đổi bảo mật giả.',
    );
    return;
  }

  customerAction(action: 'send-email' | 'reset-password' | 'lock' | 'unlock'): void {
    const customer = this.selectedCustomer();
    if (!customer) return;
    if (action === 'send-email' || action === 'reset-password') {
      this.error.set('Backend chưa hỗ trợ gửi email / đặt lại mật khẩu an toàn.');
      return;
    }
    this.confirmAction.set({ kind: 'customer', id: customer._id, name: customer.fullName, action });
  }

  money(value: number | null): string {
    return value === null ? '—' : `${value.toLocaleString('vi-VN')}đ`;
  }

  formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleDateString('vi-VN') : '—';
  }

  exportCustomers(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.requests.add(
      this.accountsService
        .exportCustomers({ q: this.q(), tier: this.tier(), status: this.status() })
        .subscribe({
          next: (file) => {
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'khach-hang.csv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.saving.set(false);
          },
          error: () => {
            this.error.set('Không xuất được dữ liệu khách hàng từ backend.');
            this.saving.set(false);
          },
        }),
    );
  }

  statusLabel(status: string): string {
    return this.statusOption(status)?.label ?? status;
  }

  statusClass(status: string): string {
    return this.statusOption(status)?.tone ?? 'mute';
  }

  isLocked(status: string): boolean {
    return this.statusOption(status)?.locked ?? false;
  }

  private statusOption(status: string) {
    return this.tab() === 'customers'
      ? this.customers()?.statuses.find((option) => option.value === status)
      : this.admins()?.statuses.find((option) => option.value === status);
  }
  ngOnDestroy(): void {
    this.listRequest?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.requests.unsubscribe();
  }
  setRoleFilter(value: string): void {
    this.searchVersion++;
    this.roleFilter.set(value);
    this.page.set(1);
    this.load();
  }
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  closeEditor(): void {
    if (!this.saving()) {
      this.editorOpen.set(false);
      this.roleEditorOpen.set(false);
      this.editorError.set('');
    }
  }
  permissionLevel(roleId: string, permissionId: string): string {
    const permissions =
      this.dirtyPermissions()[roleId] ?? this.admins()?.roles.grants[roleId] ?? [];
    return permissions.includes(permissionId)
      ? 'manage'
      : permissions.includes(permissionId + ':read')
        ? 'read'
        : 'none';
  }
  roleActions(roleId: string, module: string): string {
    const actions = this.admins()?.roles.moduleActions?.[roleId]?.[module] ?? [];
    const labels: Record<string, string> = {
      view: 'Xem',
      create: 'Tạo',
      update: 'Cập nhật',
      delete: 'Xóa',
      export: 'Xuất',
      block: 'Khóa',
      confirm: 'Xác nhận',
      cancel: 'Hủy',
      refund: 'Hoàn tiền',
      approve: 'Duyệt',
      reject: 'Từ chối',
      publish: 'Đăng',
      adjust_inventory: 'Điều chỉnh kho',
    };
    return actions.length ? actions.map((action) => labels[action] ?? action).join(', ') : '—';
  }
  setPermissionLevel(roleId: string, permissionId: string, level: string): void {
    if (this.saving()) return;
    const values = (
      this.dirtyPermissions()[roleId] ??
      this.admins()?.roles.grants[roleId] ??
      []
    ).filter((key) => key !== permissionId && key !== permissionId + ':read');
    if (level !== 'none') values.push(permissionId + (level === 'read' ? ':read' : ''));
    this.dirtyPermissions.set({ ...this.dirtyPermissions(), [roleId]: values });
  }
  confirmMutation(): void {
    const pending = this.confirmAction();
    if (!pending || this.saving()) return;
    this.saving.set(true);
    const request =
      pending.kind === 'customer'
        ? this.accountsService.customerAction(pending.id, pending.action)
        : this.accountsService
            .updateAdmin(pending.id, {
              status: pending.action === 'lock' ? 'locked' : 'active',
            })
            .pipe(map(() => undefined));
    this.requests.add(
      request.subscribe({
        next: () => {
          this.saving.set(false);
          this.confirmAction.set(null);
          this.message.set('Đã cập nhật trạng thái tài khoản.');
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.confirmAction.set(null);
          this.error.set(this.describeError(err));
        },
      }),
    );
  }
  orderStatus(status: string): string {
    return (
      (
        {
          pending: 'Chờ xác nhận',
          confirmed: 'Đã xác nhận',
          shipping: 'Đang giao',
          delivered: 'Hoàn tất',
          completed: 'Hoàn tất',
          cancelled: 'Đã hủy',
          returned: 'Đã trả',
          refunded: 'Đã hoàn tiền',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  describeError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Không kết nối được Backend. Vui lòng thử lại.';
    if (err.status === 404) return 'Không tìm thấy dữ liệu hoặc API Accounts chưa được đăng ký.';
    if ([401, 403].includes(err.status))
      return 'Phiên hết hạn hoặc không có quyền. Vui lòng đăng nhập bằng tài khoản được cấp quyền.';
    return typeof err.error?.message === 'string'
      ? err.error.message
      : 'Không xử lý được yêu cầu tài khoản.';
  }
}
