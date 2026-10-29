import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';

import { Address as AddressModel, AddressRequest, AddressType, Province } from '../../../models/account';
import { AccountService } from '../../../services/account-service';
import { ToastService } from '../../../services/toast-service';
import {
  USE_MOCK_ADDRESS,
  mockCreateAddress,
  mockDeleteAddress,
  mockGetAddresses,
  mockGetProvinces,
  mockSetDefaultAddress,
  mockUpdateAddress,
} from './address.mock';

const NAME_PATTERN = /^[\p{L}][\p{L}\s'.-]*[\p{L}]$/u;
const PHONE_PATTERN = /^(0|\+84)(\s?\d){9}$/;

export const ADDRESS_TYPES: { value: AddressType; label: string }[] = [
  { value: 'home', label: 'Nhà riêng' },
  { value: 'office', label: 'Văn phòng' },
  { value: 'school', label: 'Trường học' },
];

/** "0909123268" → "0909 123 268" */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : phone;
}

export function fullAddress(a: Pick<AddressModel, 'street' | 'ward' | 'province'>): string {
  return [a.street, a.ward, a.province].filter(Boolean).join(', ');
}

@Component({
  selector: 'app-address',
  standalone: false,
  styleUrls: ['../account-page.css', './address.css'],
  templateUrl: './address.html',
})
export class Address implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly account = inject(AccountService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formCard = viewChild<ElementRef<HTMLElement>>('formCard');

  readonly types = ADDRESS_TYPES;
  readonly formatPhone = formatPhone;
  readonly fullAddress = fullAddress;

  readonly status = signal<'loading' | 'error' | 'ready'>('loading');
  readonly addresses = signal<AddressModel[]>([]);
  readonly provinces = signal<Province[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(NAME_PATTERN)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    province: ['', Validators.required],
    ward: ['', Validators.required],
    street: ['', [Validators.required, Validators.minLength(5)]],
    type: this.fb.nonNullable.control<AddressType>('home'),
    isDefault: [false],
  });

  private readonly provinceValue = toSignal(this.form.controls.province.valueChanges, { initialValue: '' });
  readonly wards = computed(() => this.provinces().find((p) => p.name === this.provinceValue())?.wards ?? []);

  ngOnInit(): void {
    this.load();
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/locations
    (USE_MOCK_ADDRESS ? mockGetProvinces() : this.account.getLocations())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (list) => this.provinces.set(list), error: () => this.provinces.set([]) });
    // Đổi tỉnh thì chọn lại phường
    this.form.controls.province.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.wards().includes(this.form.controls.ward.value)) this.form.controls.ward.setValue('');
    });
  }

  load(): void {
    this.status.set('loading');
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/account/addresses
    (USE_MOCK_ADDRESS ? mockGetAddresses() : this.account.getAddresses())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.addresses.set(list);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }

  typeLabel(type: AddressType): string {
    return ADDRESS_TYPES.find((t) => t.value === type)?.label ?? '';
  }

  error(name: 'fullName' | 'phone' | 'province' | 'ward' | 'street'): string | null {
    const c = this.form.controls[name];
    if (c.valid || !(c.touched || this.submitted())) return null;
    switch (name) {
      case 'fullName':
        return c.hasError('required') ? 'Vui lòng nhập họ tên người nhận' : 'Họ tên chỉ gồm chữ cái';
      case 'phone':
        return c.hasError('required') ? 'Vui lòng nhập số điện thoại' : 'Số điện thoại chưa đúng định dạng';
      case 'province':
        return 'Vui lòng chọn tỉnh / thành';
      case 'ward':
        return 'Vui lòng chọn phường / xã';
      case 'street':
        return 'Vui lòng nhập số nhà, tên đường';
    }
  }

  /** Nút "+ Thêm địa chỉ mới": về form trống và cuộn tới form */
  startCreate(): void {
    this.resetForm();
    this.scrollToForm();
  }

  edit(address: AddressModel): void {
    this.editingId.set(address._id);
    this.submitted.set(false);
    this.form.reset({ ...address, phone: formatPhone(address.phone) });
    this.scrollToForm();
  }

  resetForm(): void {
    this.editingId.set(null);
    this.submitted.set(false);
    this.form.reset({ type: 'home', isDefault: this.addresses().length === 0 });
  }

  save(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const body: AddressRequest = { ...v, fullName: v.fullName.trim(), phone: v.phone.replace(/\s/g, ''), street: v.street.trim() };
    const id = this.editingId();
    // TODO: thay bằng API — bỏ nhánh mock khi có /api/account/addresses
    const request$ = id
      ? USE_MOCK_ADDRESS ? mockUpdateAddress(id, body) : this.account.updateAddress(id, body)
      : USE_MOCK_ADDRESS ? mockCreateAddress(body) : this.account.createAddress(body);
    this.run(request$, id ? 'Đã cập nhật địa chỉ' : 'Đã thêm địa chỉ mới', () => this.resetForm());
  }

  remove(address: AddressModel): void {
    if (!confirm(`Xoá địa chỉ "${fullAddress(address)}"?`)) return;
    this.run(USE_MOCK_ADDRESS ? mockDeleteAddress(address._id) : this.account.deleteAddress(address._id), 'Đã xoá địa chỉ', () => {
      if (this.editingId() === address._id) this.resetForm();
    });
  }

  setDefault(address: AddressModel): void {
    this.run(
      USE_MOCK_ADDRESS ? mockSetDefaultAddress(address._id) : this.account.setDefaultAddress(address._id),
      'Đã đặt làm địa chỉ mặc định',
    );
  }

  private run(request$: Observable<AddressModel[]>, message: string, after?: () => void): void {
    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.saving.set(false);
        this.addresses.set(list);
        this.toast.show(message);
        after?.();
      },
      error: () => {
        this.saving.set(false);
        this.toast.show('Chưa lưu được, vui lòng thử lại.');
      },
    });
  }

  private scrollToForm(): void {
    setTimeout(() => {
      const el = this.formCard()?.nativeElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }
}
