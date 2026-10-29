import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';

import { AccountProfile } from '../../../models/account';
import { AccountService } from '../../../services/account-service';
import { AuthService } from '../../../services/auth-service';
import { ToastService } from '../../../services/toast-service';
import { SharedModule } from '../../../shared/shared-module';
import { ProfileInfo, parseBirthday, passwordRules } from './profile-info';

const profile: AccountProfile = {
  _id: 'p1', fullName: 'Nguyễn Thùy Dung', username: 'thuydung.reads', email: 'thuydung@email.com',
  emailVerified: true, phone: '0909123268', birthday: '2005-02-14', gender: 'female', avatar: null,
  tier: 'Thành viên Bạc', memberId: '7904217', passwordChangedAt: '2026-09-02T08:00:00.000Z', twoFactorEnabled: true,
};

describe('ProfileInfo', () => {
  let component: ProfileInfo;
  let fixture: ComponentFixture<ProfileInfo>;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    toast = { show: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [ProfileInfo],
      imports: [ReactiveFormsModule, RouterModule, SharedModule],
      providers: [
        provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: { user: () => null, token: null, updateUser: vi.fn() } },
      ],
    }).compileComponents();
    TestBed.inject(AccountService).setProfile(profile);
    fixture = TestBed.createComponent(ProfileInfo);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  it('đổ hồ sơ vào form, ngày sinh dạng dd / mm / yyyy', () => {
    expect(component.form.getRawValue()).toMatchObject({
      fullName: 'Nguyễn Thùy Dung', phone: '0909123268', birthday: '14 / 02 / 2005', gender: 'female', twoFactorEnabled: true,
    });
    expect(component.hasChanges()).toBe(false);
  });

  it('đọc ngày sinh, loại ngày không tồn tại', () => {
    expect(parseBirthday('14/2/2005')).toBe('2005-02-14');
    expect(parseBirthday('31 / 02 / 2005')).toBeNull();
    component.form.controls.birthday.setValue('31/02/2005');
    component.form.controls.birthday.markAsTouched();
    expect(component.error('birthday')).toBe('Ngày sinh chưa hợp lệ (dd/mm/yyyy)');
  });

  it('thanh độ mạnh: 3/4 điều kiện là "Mạnh"', () => {
    expect(passwordRules('Lightbook1')).toEqual({ length: true, upper: true, digit: true, special: false });
    component.passwordForm.controls.newPassword.setValue('Lightbook1');
    expect(component.strength()).toBe(3);
    expect(component.strengthLabel()).toBe('Mạnh');
  });

  it('đổi mật khẩu: thiếu mật khẩu hiện tại / nhập lại không khớp thì báo lỗi', () => {
    component.passwordForm.setValue({ currentPassword: '', newPassword: 'Lightbook1', confirmPassword: 'Khac1234' });
    component.passwordForm.markAllAsTouched();
    expect(component.passwordError('current')).toBe('Vui lòng nhập mật khẩu hiện tại');
    expect(component.passwordError('confirm')).toBe('Mật khẩu nhập lại chưa khớp');
  });

  it('ảnh không phải JPG/PNG hoặc quá 1MB thì báo lỗi', () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' });
    component.onAvatarPicked({ target: { files: [file], value: '' } } as unknown as Event);
    expect(component.avatarError()).toBe('Ảnh phải là JPG hoặc PNG, tối đa 1MB');
  });

  it('bật xác thực 2 lớp mà xoá số điện thoại thì không cho lưu', () => {
    component.form.controls.phone.setValue('');
    component.form.markAsDirty();
    component.save();
    expect(component.twoFactorError()).toBe(true);
    expect(toast.show).toHaveBeenCalledWith('Còn thông tin chưa hợp lệ, bạn kiểm tra các ô màu đỏ nhé');
  });

  it('lưu thay đổi thì cập nhật hồ sơ và báo "Đã lưu thay đổi"', () => {
    vi.useFakeTimers();
    component.form.controls.fullName.setValue('Nguyễn Thùy Dung Mới');
    component.form.markAsDirty();
    component.save();
    vi.advanceTimersByTime(600);
    expect(TestBed.inject(AccountService).profile()?.fullName).toBe('Nguyễn Thùy Dung Mới');
    expect(toast.show).toHaveBeenCalledWith('Đã lưu thay đổi');
  });
});
