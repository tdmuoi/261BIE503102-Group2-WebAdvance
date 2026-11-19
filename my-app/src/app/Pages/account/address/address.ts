import { Component, DestroyRef, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import { Address as AddressModel, AddressType } from '../../../models/account';
import { AccountService } from '../../../services/account-service';
import { ToastService } from '../../../services/toast-service';
import { ADDRESS_TYPES, AddressEditor, AddressSaved, formatPhone, fullAddress } from './address-editor';

export { ADDRESS_TYPES, formatPhone, fullAddress };

@Component({
  selector: 'app-address',
  standalone: false,
  styleUrls: ['../account-page.css', './address.css', './address-form.css'],
  templateUrl: './address.html',
})
export class Address implements OnInit {
  private readonly account = inject(AccountService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formCard = viewChild<ElementRef<HTMLElement>>('formCard');

  readonly formatPhone = formatPhone;
  readonly fullAddress = fullAddress;

  readonly status = signal<'loading' | 'error' | 'ready'>('loading');
  readonly addresses = signal<AddressModel[]>([]);
  readonly editor = new AddressEditor();
  readonly busy = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.status.set('loading');
    this.account.getAddresses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.addresses.set(list);
          this.editor.startCreate(list.length === 0);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }

  typeLabel(type: AddressType): string {
    return ADDRESS_TYPES.find((t) => t.value === type)?.label ?? '';
  }

  startCreate(): void {
    this.editor.startCreate(this.addresses().length === 0);
    this.scrollToForm();
  }

  edit(address: AddressModel): void {
    this.editor.startEdit(address);
    this.scrollToForm();
  }

  resetForm(): void {
    this.editor.startCreate(this.addresses().length === 0);
  }

  save(): void {
    this.editor.save((result: AddressSaved) => {
      this.addresses.set(result.list);
      this.resetForm();
    });
  }

  remove(address: AddressModel): void {
    if (!confirm(`Xoá địa chỉ "${fullAddress(address)}"?`)) return;
    this.run(this.account.deleteAddress(address._id), 'Đã xoá địa chỉ', () => {
      if (this.editor.editing()?._id === address._id) this.resetForm();
    });
  }

  setDefault(address: AddressModel): void {
    this.run(this.account.setDefaultAddress(address._id), 'Đã đặt làm địa chỉ mặc định');
  }

  private run(request$: Observable<AddressModel[]>, message: string, after?: () => void): void {
    this.busy.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.busy.set(false);
        this.addresses.set(list);
        this.toast.show(message);
        after?.();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'Chưa lưu được, vui lòng thử lại.');
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
