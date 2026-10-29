import { Observable, delay, of } from 'rxjs';

import { Address, AddressRequest, Province } from '../../../models/account';

// TODO: thay bằng API — my-server chưa có /api/account/addresses và /api/locations.
// Khi backend xong: đổi USE_MOCK_ADDRESS = false. Trang Thanh toán cũng đọc sổ địa chỉ từ đây.
export const USE_MOCK_ADDRESS = true;

/** Vài tỉnh/thành mẫu (2 cấp, sau sáp nhập 01/07/2025) — danh sách đầy đủ lấy từ API */
export const MOCK_PROVINCES: Province[] = [
  { code: 'HCM', name: 'TP. Hồ Chí Minh', wards: ['Phường Sài Gòn', 'Phường Bến Thành', 'Phường Gò Vấp', 'Phường Hạnh Thông', 'Phường Linh Xuân', 'Phường Thủ Đức', 'Phường Dĩ An'] },
  { code: 'HN', name: 'TP. Hà Nội', wards: ['Phường Hoàn Kiếm', 'Phường Ba Đình', 'Phường Cầu Giấy', 'Phường Đống Đa'] },
  { code: 'DN', name: 'TP. Đà Nẵng', wards: ['Phường Hải Châu', 'Phường Sơn Trà', 'Phường Hội An'] },
  { code: 'CT', name: 'TP. Cần Thơ', wards: ['Phường Ninh Kiều', 'Phường Cái Răng'] },
];

let addresses: Address[] = [
  { _id: 'addr-1', fullName: 'Nguyễn Thùy Dung', phone: '0909123268', province: 'TP. Hồ Chí Minh', ward: 'Phường Hạnh Thông', street: '12 Nguyễn Văn Bảo', type: 'home', isDefault: true },
  { _id: 'addr-2', fullName: 'Nguyễn Thùy Dung', phone: '0909123268', province: 'TP. Hồ Chí Minh', ward: 'Phường Linh Xuân', street: '669 Quốc lộ 1, Khu phố 3', type: 'school', isDefault: false },
];

const snapshot = () => of(addresses.map((a) => ({ ...a }))).pipe(delay(300));

/** Chỉ một địa chỉ mặc định; danh sách luôn để địa chỉ mặc định lên đầu */
function normalize(list: Address[], defaultId?: string): Address[] {
  const id = defaultId ?? list.find((a) => a.isDefault)?._id ?? list[0]?._id;
  return list.map((a) => ({ ...a, isDefault: a._id === id })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function mockGetAddresses(): Observable<Address[]> {
  return snapshot();
}

export function mockGetProvinces(): Observable<Province[]> {
  return of(MOCK_PROVINCES).pipe(delay(200));
}

export function mockCreateAddress(body: AddressRequest): Observable<Address[]> {
  const created: Address = { ...body, _id: `addr-${Date.now()}` };
  addresses = normalize([...addresses, created], body.isDefault || !addresses.length ? created._id : undefined);
  return snapshot();
}

export function mockUpdateAddress(id: string, body: AddressRequest): Observable<Address[]> {
  addresses = normalize(addresses.map((a) => (a._id === id ? { ...body, _id: id } : a)), body.isDefault ? id : undefined);
  return snapshot();
}

export function mockDeleteAddress(id: string): Observable<Address[]> {
  addresses = normalize(addresses.filter((a) => a._id !== id));
  return snapshot();
}

export function mockSetDefaultAddress(id: string): Observable<Address[]> {
  addresses = normalize(addresses, id);
  return snapshot();
}
