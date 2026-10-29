import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { Observable, forkJoin, map, of } from 'rxjs';

import { AccountProfile, Gender, UpdateProfileRequest } from '../../../models/account';
import { AccountService } from '../../../services/account-service';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';
import { Account, initialsOf } from '../account';
import {
  USE_MOCK_ACCOUNT,
  mockChangePassword,
  mockDeleteAvatar,
  mockUpdateProfile,
  mockUploadAvatar,
} from '../account.mock';

const NAME_PATTERN = /^[\p{L}][\p{L}\s'.-]*[\p{L}]$/u;
/** Số di động Việt Nam, cho phép gõ có dấu cách: 0909 123 268 */
const PHONE_PATTERN = /^(0|\+84)(\s?\d){9}$/;
const BIRTHDAY_PATTERN = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/;
const AVATAR_TYPES = ['image/jpeg', 'image/png'];
const AVATAR_MAX = 1024 * 1024;

/** "14 / 02 / 2005" → "2005-02-14", sai ngày thì null */
export function parseBirthday(text: string): string | null {
  const m = BIRTHDAY_PATTERN.exec(text);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2005-02-14" → "14 / 02 / 2005" */
function formatBirthday(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d} / ${m} / ${y}`;
}

function birthdayValidator(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? '').trim();
  if (!text) return null;
  const iso = parseBirthday(text);
  if (!iso) return { birthday: true };
  const year = +iso.slice(0, 4);
  return iso > new Date().toISOString().slice(0, 10) || year < 1900 ? { birthday: true } : null;
}

/** 4 điều kiện ở thanh độ mạnh mật khẩu (Figma) */
export function passwordRules(value: string) {
  return {
    length: value.length >= 8,
    upper: /\p{Lu}/u.test(value),
    digit: /\d/.test(value),
    special: /[^\p{L}\d\s]/u.test(value),
  };
}

/** Đổi mật khẩu là tuỳ chọn: chỉ kiểm tra khi đã gõ vào một trong 3 ô */
function passwordGroupValidator(group: AbstractControl): ValidationErrors | null {
  const { currentPassword: cur, newPassword: next, confirmPassword: confirm } = group.value as Record<string, string>;
  if (!cur && !next && !confirm) return null;
  const errors: ValidationErrors = {};
  if (!cur) errors['currentRequired'] = true;
  const rules = passwordRules(next ?? '');
  if (!next) errors['newRequired'] = true;
  else if (!rules.length || !rules.upper || !rules.digit) errors['weak'] = true;
  else if (next === cur) errors['sameAsCurrent'] = true;
  if (next && confirm !== next) errors['mismatch'] = true;
  return Object.keys(errors).length ? errors : null;
}

@Component({
  selector: 'app-profile-info',
  standalone: false,
  styleUrls: ['../account-page.css', './profile-info.css'],
  templateUrl: './profile-info.html',
})
export class ProfileInfo {
  private readonly fb = inject(FormBuilder);
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shell = inject(Account, { optional: true });

  readonly profile = this.account.profile;
  readonly profileError = this.account.profileError;

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly show = signal({ current: false, next: false, confirm: false });

  /** Ảnh đại diện đang hiển thị (có thể là ảnh mới chọn chưa lưu) */
  readonly avatarPreview = signal<string | null>(null);
  readonly avatarError = signal<string | null>(null);
  /** undefined: không đổi · File: tải ảnh mới · null: xoá ảnh */
  private avatarChange: File | null | undefined = undefined;

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(NAME_PATTERN)]],
    phone: ['', [Validators.pattern(PHONE_PATTERN)]],
    birthday: ['', [birthdayValidator]],
    gender: this.fb.control<Gender | null>(null),
    twoFactorEnabled: [false],
  });

  readonly passwordForm = this.fb.nonNullable.group(
    { currentPassword: [''], newPassword: [''], confirmPassword: [''] },
    { validators: passwordGroupValidator },
  );

  private readonly newPassword = toSignal(this.passwordForm.controls.newPassword.valueChanges, { initialValue: '' });
  readonly rules = computed(() => passwordRules(this.newPassword()));
  readonly strength = computed(() => (this.newPassword() ? Object.values(this.rules()).filter(Boolean).length : 0));
  readonly strengthLabel = computed(() => ['', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'][this.strength()]);
  readonly bars = [1, 2, 3, 4];

  readonly initials = computed(() => initialsOf(this.profile()?.fullName ?? ''));

  constructor() {
    // Hồ sơ tải xong (hoặc vừa lưu) thì đổ vào form
    effect(() => {
      const profile = this.profile();
      if (profile) untracked(() => this.fill(profile));
    });
  }

  retry(): void {
    this.shell?.loadProfile();
  }

  toggle(key: 'current' | 'next' | 'confirm'): void {
    this.show.update((s) => ({ ...s, [key]: !s[key] }));
  }

  // ---------- Ảnh đại diện ----------
  onAvatarPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type) || file.size > AVATAR_MAX) {
      this.avatarError.set('Ảnh phải là JPG hoặc PNG, tối đa 1MB');
      return;
    }
    this.avatarError.set(null);
    this.avatarChange = file;
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  removeAvatar(): void {
    this.avatarError.set(null);
    this.avatarChange = null;
    this.avatarPreview.set(null);
  }

  // ---------- Lỗi từng ô ----------
  private shown(c: AbstractControl): boolean {
    return c.touched || this.submitted();
  }

  error(name: 'fullName' | 'phone' | 'birthday'): string | null {
    const c = this.form.controls[name];
    if (c.valid || !this.shown(c)) return null;
    if (name === 'fullName') return c.hasError('required') ? 'Vui lòng nhập họ và tên' : 'Họ tên chỉ gồm chữ cái, ít nhất 2 ký tự';
    if (name === 'phone') return 'Số điện thoại chưa đúng định dạng';
    return 'Ngày sinh chưa hợp lệ (dd/mm/yyyy)';
  }

  /** Bật xác thực 2 lớp nhưng chưa có số điện thoại */
  twoFactorError(): boolean {
    const v = this.form.getRawValue();
    return v.twoFactorEnabled && !v.phone.trim() && (this.form.controls.twoFactorEnabled.dirty || this.submitted());
  }

  passwordError(field: 'current' | 'next' | 'confirm'): string | null {
    const g = this.passwordForm;
    const e = g.errors;
    if (!e) return null;
    const touched = (name: 'currentPassword' | 'newPassword' | 'confirmPassword') =>
      g.controls[name].touched || this.submitted();
    if (field === 'current' && touched('currentPassword')) {
      if (e['currentRequired']) return 'Vui lòng nhập mật khẩu hiện tại';
      if (e['wrongCurrent']) return 'Mật khẩu hiện tại chưa đúng';
    }
    if (field === 'next' && touched('newPassword')) {
      if (e['newRequired']) return 'Vui lòng nhập mật khẩu mới';
      if (e['weak']) return 'Cần ít nhất 8 ký tự, có chữ hoa và chữ số';
      if (e['sameAsCurrent']) return 'Mật khẩu mới phải khác mật khẩu hiện tại';
    }
    if (field === 'confirm' && touched('confirmPassword') && e['mismatch']) return 'Mật khẩu nhập lại chưa khớp';
    return null;
  }

  passwordChangedText(): string {
    const at = this.profile()?.passwordChangedAt;
    return at ? new Date(at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  }

  hasChanges(): boolean {
    const pw = this.passwordForm.getRawValue();
    return this.form.dirty || this.avatarChange !== undefined || !!(pw.currentPassword || pw.newPassword || pw.confirmPassword);
  }

  cancel(): void {
    const profile = this.profile();
    if (profile) this.fill(profile);
  }

  save(): void {
    const profile = this.profile();
    if (!profile || this.saving()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.passwordForm.markAllAsTouched();
    if (this.form.invalid || this.passwordForm.invalid || this.twoFactorError()) {
      this.toast.show('Còn thông tin chưa hợp lệ, bạn kiểm tra các ô màu đỏ nhé');
      return;
    }

    const v = this.form.getRawValue();
    const body: UpdateProfileRequest = {
      fullName: v.fullName.trim(),
      phone: v.phone.replace(/\s/g, '') || null,
      birthday: v.birthday.trim() ? parseBirthday(v.birthday) : null,
      gender: v.gender,
      twoFactorEnabled: v.twoFactorEnabled,
    };
    const pw = this.passwordForm.getRawValue();

    // TODO: thay bằng API — bỏ các nhánh mock khi my-server có /api/account/*
    const id = profile._id;
    const steps: Observable<Partial<AccountProfile>>[] = [
      USE_MOCK_ACCOUNT ? mockUpdateProfile(id, body) : this.account.updateProfile(body),
    ];
    if (this.avatarChange instanceof File) {
      steps.push((USE_MOCK_ACCOUNT ? mockUploadAvatar(id, this.avatarChange) : this.account.uploadAvatar(this.avatarChange)));
    } else if (this.avatarChange === null) {
      steps.push((USE_MOCK_ACCOUNT ? mockDeleteAvatar(id) : this.account.deleteAvatar()).pipe(map(() => ({ avatar: null }))));
    }
    if (pw.newPassword) {
      const req = { currentPassword: pw.currentPassword, newPassword: pw.newPassword };
      steps.push(USE_MOCK_ACCOUNT ? mockChangePassword(id, req) : this.account.changePassword(req));
    }

    this.saving.set(true);
    forkJoin(steps.length ? steps : [of({})])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (parts) => {
          const next: AccountProfile = Object.assign({ ...profile }, ...parts);
          this.saving.set(false);
          this.account.setProfile(next);
          // Đồng bộ tên / SĐT / ảnh vào phiên đăng nhập (header, các trang khác dùng)
          const user = this.auth.user();
          if (user) this.auth.updateUser({ ...user, fullName: next.fullName, phone: next.phone, avatar: next.avatar });
          this.toast.show('Đã lưu thay đổi');
        },
        error: (err: { status?: number; error?: { field?: string } }) => {
          this.saving.set(false);
          if (err?.error?.field === 'currentPassword') {
            this.passwordForm.setErrors({ ...(this.passwordForm.errors ?? {}), wrongCurrent: true });
            return;
          }
          this.toast.show(err?.status === 0 ? 'Không kết nối được máy chủ. Vui lòng thử lại.' : 'Lưu chưa thành công. Vui lòng thử lại.');
        },
      });
  }

  private fill(profile: AccountProfile): void {
    this.form.reset({
      fullName: profile.fullName,
      phone: profile.phone ?? '',
      birthday: formatBirthday(profile.birthday),
      gender: profile.gender,
      twoFactorEnabled: profile.twoFactorEnabled,
    });
    this.passwordForm.reset();
    this.avatarChange = undefined;
    this.avatarPreview.set(profile.avatar);
    this.avatarError.set(null);
    this.submitted.set(false);
  }
}
