import { Component, computed, signal } from '@angular/core';

type BuybackStatus = 'pending' | 'reviewing' | 'paid' | 'rejected';
type StatusFilter = '' | BuybackStatus;
type ShippingMethod = 'branch' | 'postal';

interface BuybackRequest {
  id: string;
  code: string;
  title: string;
  sender: string;
  phone: string;
  condition: string;
  price: number;
  quantity: number;
  shipping: ShippingMethod;
  status: BuybackStatus;
  date: string;
  cover: string;
  coverText: string;
}

interface PendingAction {
  type: 'reject' | 'delete';
  ids: string[];
}

@Component({
  selector: 'app-buyback-requests',
  standalone: false,
  styleUrl: './buyback-requests.css',
  templateUrl: './buyback-requests.html',
})
export class BuybackRequests {
  readonly statusInfo: Record<BuybackStatus, { label: string; tone: 'warn' | 'info' | 'ok' | 'bad' }> = {
    pending: { label: 'Chờ duyệt', tone: 'warn' },
    reviewing: { label: 'Đang thẩm định', tone: 'info' },
    paid: { label: 'Đã thanh toán', tone: 'ok' },
    rejected: { label: 'Từ chối', tone: 'bad' },
  };

  readonly tabs: { value: StatusFilter; label: string }[] = [
    { value: '', label: 'Tất cả' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'reviewing', label: 'Đang thẩm định' },
    { value: 'paid', label: 'Đã thanh toán' },
    { value: 'rejected', label: 'Từ chối' },
  ];

  readonly conditions = ['95% Như mới', '98% Như mới', '90% Tốt', '85% Tốt', '80% Hơi cũ', '70% Cũ', '60% Cũ'];
  readonly requests = signal<BuybackRequest[]>([]);

  readonly query = signal('');
  readonly status = signal<StatusFilter>('');
  readonly condition = signal('');
  readonly shipping = signal<'' | ShippingMethod>('');
  readonly dateRange = signal('');
  readonly sort = signal<'newest' | 'oldest'>('newest');
  readonly page = signal(1);
  readonly pageSize = 8;
  readonly selectedIds = signal<string[]>([]);
  readonly selectedRequest = signal<BuybackRequest | null>(null);
  readonly pendingAction = signal<PendingAction | null>(null);
  readonly showRules = signal(false);

  readonly filteredRequests = computed(() => {
    const query = this.query().toLocaleLowerCase('vi');
    const days = Number(this.dateRange());
    const earliestDate = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
    return this.requests()
      .filter((request) => !this.status() || request.status === this.status())
      .filter((request) => !this.condition() || request.condition === this.condition())
      .filter((request) => !this.shipping() || request.shipping === this.shipping())
      .filter((request) => !earliestDate || new Date(request.date).getTime() >= earliestDate)
      .filter((request) => !query || [request.code, request.title, request.sender, request.phone]
        .some((value) => value.toLocaleLowerCase('vi').includes(query)))
      .sort((a, b) => this.sort() === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  });

  readonly visibleRequests = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredRequests().slice(start, start + this.pageSize);
  });
  readonly allVisibleSelected = computed(() => {
    const ids = this.visibleRequests().map((request) => request.id);
    return ids.length > 0 && ids.every((id) => this.selectedIds().includes(id));
  });
  readonly someVisibleSelected = computed(() => this.visibleRequests().some((request) => this.isSelected(request.id)) && !this.allVisibleSelected());
  readonly confirmTitle = computed(() => this.pendingAction()?.type === 'delete' ? 'Xoá yêu cầu thanh lý?' : 'Từ chối yêu cầu thanh lý?');
  readonly confirmMessage = computed(() => this.pendingAction()?.type === 'delete'
    ? 'Yêu cầu đã xoá sẽ không còn trong danh sách.'
    : 'Các yêu cầu đã chọn sẽ được chuyển sang trạng thái từ chối.');
  readonly confirmButton = computed(() => this.pendingAction()?.type === 'delete' ? 'Xoá yêu cầu' : 'Từ chối yêu cầu');

  count(status: StatusFilter): number {
    return status ? this.requests().filter((request) => request.status === status).length : this.requests().length;
  }

  onSearch(value: string): void {
    this.query.set(value.trim());
    this.resetPage();
  }

  setStatus(value: StatusFilter): void {
    this.status.set(value);
    this.resetPage();
  }

  setCondition(value: string): void {
    this.condition.set(value);
    this.resetPage();
  }

  setShipping(value: string): void {
    this.shipping.set(value === 'branch' || value === 'postal' ? value : '');
    this.resetPage();
  }

  setDateRange(value: string): void {
    this.dateRange.set(value);
    this.resetPage();
  }

  setSort(value: string): void {
    this.sort.set(value === 'oldest' ? 'oldest' : 'newest');
    this.resetPage();
  }

  goToPage(page: number): void {
    this.page.set(page);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(id: string): void {
    this.selectedIds.update((ids) => ids.includes(id) ? ids.filter((selected) => selected !== id) : [...ids, id]);
  }

  toggleVisible(checked: boolean): void {
    const visibleIds = this.visibleRequests().map((request) => request.id);
    this.selectedIds.update((selected) => checked
      ? [...new Set([...selected, ...visibleIds])]
      : selected.filter((id) => !visibleIds.includes(id)));
  }

  clearSelection(): void {
    this.selectedIds.set([]);
  }

  approve(id: string): void {
    this.updateStatus([id], 'reviewing');
  }

  approveSelected(): void {
    this.updateStatus(this.selectedIds(), 'reviewing');
  }

  askReject(ids: string[]): void {
    this.pendingAction.set({ type: 'reject', ids });
  }

  askDelete(ids: string[]): void {
    this.pendingAction.set({ type: 'delete', ids });
  }

  confirmAction(): void {
    const action = this.pendingAction();
    if (!action) return;
    if (action.type === 'delete') {
      this.requests.update((requests) => requests.filter((request) => !action.ids.includes(request.id)));
      this.selectedIds.update((ids) => ids.filter((id) => !action.ids.includes(id)));
      this.clampPage();
    } else {
      this.updateStatus(action.ids, 'rejected');
    }
    this.pendingAction.set(null);
  }

  openDetails(request: BuybackRequest): void {
    this.selectedRequest.set(request);
  }

  closeDetails(): void {
    this.selectedRequest.set(null);
  }

  money(value: number): string {
    return value.toLocaleString('vi-VN') + 'đ';
  }

  exportRequests(): void {
    const header = ['Mã yêu cầu', 'Sách', 'Người gửi', 'Tình trạng', 'Giá đề xuất', 'Số lượng', 'Gửi qua', 'Trạng thái', 'Ngày gửi'];
    const rows = this.filteredRequests().map((request) => [
      request.code, request.title, request.sender, request.condition, request.price,
      request.quantity, request.shipping === 'branch' ? 'Chi nhánh' : 'Bưu điện',
      this.statusInfo[request.status].label, request.date,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yeu-cau-thanh-ly.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  private updateStatus(ids: string[], status: BuybackStatus): void {
    this.requests.update((requests) => requests.map((request) => ids.includes(request.id) ? { ...request, status } : request));
    this.clearSelection();
    const current = this.selectedRequest();
    if (current && ids.includes(current.id)) this.selectedRequest.set({ ...current, status });
  }

  private resetPage(): void {
    this.page.set(1);
  }

  private clampPage(): void {
    const lastPage = Math.max(1, Math.ceil(this.filteredRequests().length / this.pageSize));
    if (this.page() > lastPage) this.page.set(lastPage);
  }
}
