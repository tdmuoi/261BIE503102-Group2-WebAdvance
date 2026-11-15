import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';

import { AuthService } from '../../../services/auth-service';
import { provideFakeCustomerApi } from '../../../testing/fake-customer-api';
import { ToastService } from '../../../services/toast-service';
import { Address, formatPhone, fullAddress } from './address';

describe('Address', () => {
  let component: Address;
  let fixture: ComponentFixture<Address>;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    toast = { show: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [Address],
      imports: [ReactiveFormsModule, RouterModule],
      providers: [
        provideRouter([]),
        { provide: ToastService, useValue: toast },
        provideFakeCustomerApi(),
        { provide: AuthService, useValue: { token: 'f'.repeat(64) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(Address);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.advanceTimersByTime(400);
  });

  afterEach(() => vi.useRealTimers());

  it('tải sổ địa chỉ, địa chỉ mặc định đứng đầu', () => {
    expect(component.status()).toBe('ready');
    expect(component.addresses()[0].isDefault).toBe(true);
    expect(formatPhone('0909123268')).toBe('0909 123 268');
    expect(fullAddress({ street: '12 Nguyễn Văn Bảo', ward: 'Phường Hạnh Thông', province: 'TP. Hồ Chí Minh' }))
      .toBe('12 Nguyễn Văn Bảo, Phường Hạnh Thông, TP. Hồ Chí Minh');
  });

  it('form trống thì báo lỗi, không lưu', () => {
    component.save();
    expect(component.editor.error('fullName')).toBe('Vui lòng nhập họ tên người nhận');
    expect(component.editor.error('province')).toBe('Vui lòng chọn tỉnh / thành phố');
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('có đủ 34 tỉnh / thành (9 thành phố trực thuộc Trung ương + 25 tỉnh); phường gợi ý theo tỉnh, vẫn cho tự nhập', () => {
    const names = component.editor.provinces().map((p) => p.name);
    expect(names.length).toBe(34);
    expect(component.editor.cities().map((p) => p.name)).toEqual([
      'TP. Hà Nội', 'TP. Hồ Chí Minh', 'TP. Hải Phòng', 'TP. Đà Nẵng', 'TP. Huế', 'TP. Cần Thơ', 'TP. Đồng Nai', 'TP. Bắc Ninh', 'TP. Quảng Ninh',
    ]);
    expect(component.editor.otherProvinces().length).toBe(25);
    component.editor.form.controls.province.setValue('TP. Đà Nẵng');
    expect(component.editor.wards()).toContain('Phường Hải Châu');
    component.editor.form.controls.province.setValue('Gia Lai');
    component.editor.form.controls.ward.setValue('Phường Pleiku');
    expect(component.editor.form.controls.ward.valid).toBe(true);
  });

  it('sửa địa chỉ cũ có tên tỉnh trước sáp nhập thì vẫn giữ và báo là tên cũ', () => {
    component.edit({ ...component.addresses()[0], province: 'Bình Dương' });
    expect(component.editor.legacyProvince()).toBe('Bình Dương');
  });

  it('thêm địa chỉ mới đặt làm mặc định thì địa chỉ đó lên đầu', () => {
    const before = component.addresses().length;
    component.editor.form.setValue({
      fullName: 'Trần Mai Anh', phone: '0912 345 678', province: 'TP. Hà Nội', ward: 'Phường Cầu Giấy',
      street: '1 Xuân Thủy', type: 'office', isDefault: true,
    });
    component.save();
    vi.advanceTimersByTime(400);
    expect(component.addresses().length).toBe(before + 1);
    expect(component.addresses()[0]).toMatchObject({ fullName: 'Trần Mai Anh', isDefault: true });
    expect(component.addresses().filter((a) => a.isDefault).length).toBe(1);
    expect(toast.show).toHaveBeenCalledWith('Đã thêm địa chỉ mới');
  });
});
