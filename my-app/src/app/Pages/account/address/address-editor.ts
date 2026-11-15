import { DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';

import { Address, AddressRequest, AddressType, Province } from '../../../models/account';
import { AccountService } from '../../../services/account-service';
import { ToastService } from '../../../services/toast-service';

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

export function fullAddress(a: Pick<Address, 'street' | 'ward' | 'province'>): string {
  return [a.street, a.ward, a.province].filter(Boolean).join(', ');
}

/** Kết quả lưu: sổ địa chỉ mới + id địa chỉ vừa thêm / sửa */
export interface AddressSaved {
  list: Address[];
  id: string | null;
  created: boolean;
}

/**
 * Logic form thêm / sửa địa chỉ, dùng chung cho Sổ địa chỉ (/account/address) và trang Thanh toán
 * (giống cách VoucherState dùng chung ô mã giảm giá). Tạo trong component:
 *   readonly editor = new AddressEditor();          // phải tạo ở field initializer (cần inject)
 * Template: address-form.html được chép ở 2 trang, style chung ở address-form.css.
 */
export class AddressEditor {
  private readonly fb = inject(FormBuilder);
  private readonly account = inject(AccountService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly types = ADDRESS_TYPES;
  readonly provinces = signal<Province[]>([]);
  /** Địa chỉ đang sửa; null = thêm mới */
  readonly editing = signal<Address | null>(null);
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(NAME_PATTERN)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    province: ['', Validators.required],
    ward: ['', [Validators.required, Validators.minLength(2)]],
    street: ['', [Validators.required, Validators.minLength(5)]],
    type: this.fb.nonNullable.control<AddressType>('home'),
    isDefault: [false],
  });

  private readonly provinceValue = toSignal(this.form.controls.province.valueChanges, { initialValue: '' });
  /** Gợi ý phường / xã (chỉ vài thành phố có dữ liệu) — vẫn cho tự nhập */
  readonly wards = computed(() => this.provinces().find((p) => p.name === this.provinceValue())?.wards ?? []);
  readonly cities = computed(() => this.provinces().slice(0, 9));
  readonly otherProvinces = computed(() => this.provinces().slice(9));
  /** Tỉnh lưu trong địa chỉ cũ nhưng không còn trong danh sách 34 tỉnh / thành (tên trước sáp nhập) */
  readonly legacyProvince = computed(() => {
    const p = this.provinceValue();
    return p && this.provinces().length && !this.provinces().some((x) => x.name === p) ? p : null;
  });

  constructor() {
    this.account.getLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (list) => this.provinces.set(list), error: () => this.provinces.set([]) });
  }

  /** Mở form thêm mới; firstAddress = sổ địa chỉ đang trống thì tích sẵn "mặc định" */
  startCreate(firstAddress = false): void {
    this.editing.set(null);
    this.submitted.set(false);
    this.form.reset({ type: 'home', isDefault: firstAddress });
  }

  startEdit(a: Address): void {
    this.editing.set(a);
    this.submitted.set(false);
    this.form.reset({ fullName: a.fullName, phone: formatPhone(a.phone), province: a.province, ward: a.ward, street: a.street, type: a.type, isDefault: a.isDefault });
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
        return 'Vui lòng chọn tỉnh / thành phố';
      case 'ward':
        return 'Vui lòng nhập phường / xã';
      case 'street':
        return 'Vui lòng nhập số nhà, tên đường';
    }
  }

  /** Lưu lên server; thành công thì gọi onSaved với sổ địa chỉ mới */
  save(onSaved: (result: AddressSaved) => void): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const body: AddressRequest = { ...v, fullName: v.fullName.trim(), phone: v.phone.replace(/\s/g, ''), ward: v.ward.trim(), street: v.street.trim() };
    const editing = this.editing();
    const request$ = editing ? this.account.updateAddress(editing._id, body) : this.account.createAddress(body);
    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.saving.set(false);
        // Server trả cả sổ địa chỉ: địa chỉ vừa thêm là địa chỉ khớp nội dung vừa gửi
        const id = editing
          ? editing._id
          : ([...list].reverse().find((a) => a.street === body.street && a.ward === body.ward && a.phone === body.phone && a.province === body.province)?._id ?? null);
        this.toast.show(editing ? 'Đã cập nhật địa chỉ' : 'Đã thêm địa chỉ mới');
        onSaved({ list, id, created: !editing });
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.toast.show(err?.error?.message ?? 'Chưa lưu được, vui lòng thử lại.');
      },
    });
  }
}
