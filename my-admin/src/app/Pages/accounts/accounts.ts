import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

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

@Component({
  selector: 'app-accounts',
  standalone: false,
  styleUrl: './accounts-compact.css',
  templateUrl: './accounts.html',
})
export class Accounts {
  private readonly accountsService = inject(AccountManagementService);
  private readonly search$ = new Subject<string>();

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
  readonly total = computed(() => this.tab() === 'customers' ? this.customers()?.total ?? 0 : this.admins()?.total ?? 0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly hasPermissionChanges = computed(() => Object.keys(this.dirtyPermissions()).length > 0);

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((text) => {
      this.q.set(text);
      this.page.set(1);
      this.load();
    });
    this.load();
  }

  setTab(tab: AccountTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.q.set('');
    this.tier.set('');
    this.status.set('');
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
    this.setTab('admins');
  }

  onSearch(value: string): void {
    this.search$.next(value.trim());
  }

  setFilter(name: 'tier' | 'status', value: string): void {
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
    this.loading.set(true);
    this.error.set('');
    const query: AccountQuery = {
      q: this.q(), tier: this.tier(), status: this.status(), page: this.page(), limit: this.pageSize,
    };
    const handleError = (err: HttpErrorResponse) => {
      this.error.set(err.status === 0
        ? 'Không kết nối được my-server (http://localhost:3002).'
        : err.status === 404
          ? 'Backend chưa có API quản lý tài khoản (/api/admin/accounts). Dữ liệu và thao tác đang chờ API thật; không có dữ liệu mẫu.'
          : 'Không tải được dữ liệu tài khoản. Hãy kiểm tra API quản trị tài khoản.');
      this.loading.set(false);
    };
    if (this.tab() === 'customers') {
      this.accountsService.getCustomers(query).subscribe({
        next: (result) => {
          this.customers.set(result);
          const selected = this.selectedCustomer();
          if (!selected || !result.items.some((customer) => customer._id === selected._id)) {
            const first = result.items[0];
            if (first) this.selectCustomer(first);
            else { this.selectedCustomer.set(null); this.loading.set(false); }
          } else this.loading.set(false);
        },
        error: handleError,
      });
    } else {
      this.accountsService.getAdmins(query).subscribe({
        next: (result) => {
          this.admins.set(result);
          this.dirtyPermissions.set({});
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
    this.loading.set(true);
    this.error.set('');
    this.accountsService.getCustomer(customer._id).subscribe({
      next: (detail) => {
        this.selectedCustomer.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không tải được chi tiết khách hàng từ backend.');
        this.loading.set(false);
      },
    });
  }

  closeCustomer(): void {
    this.selectedCustomer.set(null);
  }

  openAdminEditor(admin: AdminAccount | null = null): void {
    this.selectedAdmin.set(admin);
    this.editName.set(admin?.fullName ?? '');
    this.editEmail.set(admin?.email ?? '');
    this.editRole.set(admin?.roleId ?? this.admins()?.roles.roles[0]?._id ?? '');
    this.editStatus.set(admin?.status ?? this.admins()?.statuses[0]?.value ?? '');
    this.editorOpen.set(true);
  }

  saveAdmin(): void {
    const body: AdminAccountRequest = {
      fullName: this.editName().trim(), email: this.editEmail().trim(), roleId: this.editRole(), status: this.editStatus(),
    };
    if (!body.fullName || !body.email || !body.roleId) return;
    this.saving.set(true);
    const current = this.selectedAdmin();
    const request = current ? this.accountsService.updateAdmin(current._id, body) : this.accountsService.createAdmin(body);
    request.subscribe({
      next: () => { this.editorOpen.set(false); this.saving.set(false); this.load(); },
      error: () => { this.error.set('Không lưu được quản trị viên. Kiểm tra API và quyền truy cập.'); this.saving.set(false); },
    });
  }

  removeAdmin(admin: AdminAccount): void {
    if (!window.confirm(`Xóa quyền truy cập của ${admin.fullName}?`)) return;
    this.saving.set(true);
    this.accountsService.deleteAdmin(admin._id).subscribe({
      next: () => { this.saving.set(false); this.load(); },
      error: () => { this.error.set('Không xóa được quản trị viên. Kiểm tra API và quyền truy cập.'); this.saving.set(false); },
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
    return (this.dirtyPermissions()[roleId] ?? this.admins()?.roles.grants[roleId] ?? []).includes(permissionId);
  }

  savePermissions(): void {
    const changes = Object.entries(this.dirtyPermissions());
    if (!changes.length) return;
    this.saving.set(true);
    let remaining = changes.length;
    let failed = false;
    changes.forEach(([roleId, permissionIds]) => this.accountsService.updateRolePermissions(roleId, permissionIds).subscribe({
      next: () => {
        remaining -= 1;
        if (!remaining) { this.saving.set(false); this.permissionEditing.set(false); this.load(); }
      },
      error: () => {
        failed = true;
        this.saving.set(false);
        this.error.set('Không lưu được ma trận quyền. Kiểm tra API và quyền truy cập.');
      },
    }));
    if (failed) this.saving.set(false);
  }

  beginPermissionEdit(): void {
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
    const body = {
      code: this.roleCode().trim(),
      name: this.roleName().trim(),
      description: this.roleDescription().trim(),
    };
    if (!body.code || !body.name) return;
    this.saving.set(true);
    this.accountsService.createRole(body).subscribe({
      next: () => { this.saving.set(false); this.roleEditorOpen.set(false); this.load(); },
      error: () => { this.error.set('Không tạo được vai trò. Backend cần hỗ trợ API quản lý vai trò.'); this.saving.set(false); },
    });
  }

  updateSecurity(name: 'requireTwoFactor' | 'forcePasswordRotation' | 'restrictOfficeIp', value: boolean): void {
    const settings = this.admins()?.security;
    if (!settings) return;
    const next = { ...settings, [name]: value };
    this.saving.set(true);
    this.accountsService.updateSecurity(next).subscribe({
      next: () => { this.saving.set(false); this.load(); },
      error: () => { this.error.set('Không cập nhật được bảo mật đăng nhập. Kiểm tra API và quyền truy cập.'); this.saving.set(false); },
    });
  }

  customerAction(action: 'send-email' | 'reset-password' | 'lock' | 'unlock'): void {
    const customer = this.selectedCustomer();
    if (!customer) return;
    this.saving.set(true);
    this.accountsService.customerAction(customer._id, action).subscribe({
      next: () => { this.saving.set(false); this.load(); this.selectCustomer(customer); },
      error: () => { this.error.set('Không thực hiện được thao tác tài khoản. Kiểm tra API và quyền truy cập.'); this.saving.set(false); },
    });
  }

  money(value: number): string {
    return `${(value ?? 0).toLocaleString('vi-VN')}đ`;
  }

  formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleDateString('vi-VN') : '—';
  }

  exportCustomers(): void {
    this.saving.set(true);
    this.accountsService.exportCustomers({ q: this.q(), tier: this.tier(), status: this.status() }).subscribe({
      next: (file) => {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'khach-hang.csv';
        link.click();
        URL.revokeObjectURL(url);
        this.saving.set(false);
      },
      error: () => { this.error.set('Không xuất được dữ liệu khách hàng từ backend.'); this.saving.set(false); },
    });
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
}
