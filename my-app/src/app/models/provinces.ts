import { Province } from './account';

/**
 * 34 đơn vị hành chính cấp tỉnh (cập nhật 20/9/2026): 9 thành phố trực thuộc Trung ương + 25 tỉnh.
 * - Đồng Nai lên thành phố từ 30/4/2026; Bắc Ninh, Quảng Ninh lên thành phố từ 20/9/2026.
 * Phường/xã: chưa có nguồn dữ liệu đầy đủ (hơn 3.000 đơn vị) nên form cho tự nhập,
 * vài thành phố có sẵn gợi ý dưới đây. TODO: thay bằng API địa giới hành chính khi có.
 */
const city = (code: string, name: string, wards: string[] = []): Province => ({ code, name: `TP. ${name}`, wards });
const province = (code: string, name: string): Province => ({ code, name, wards: [] });

export const CITIES: Province[] = [
  city('HN', 'Hà Nội', ['Phường Hoàn Kiếm', 'Phường Ba Đình', 'Phường Cầu Giấy', 'Phường Đống Đa']),
  city('HCM', 'Hồ Chí Minh', ['Phường Sài Gòn', 'Phường Bến Thành', 'Phường Gò Vấp', 'Phường Hạnh Thông', 'Phường Linh Xuân', 'Phường Thủ Đức', 'Phường Dĩ An']),
  city('HP', 'Hải Phòng'),
  city('DN', 'Đà Nẵng', ['Phường Hải Châu', 'Phường Sơn Trà', 'Phường Hội An']),
  city('HUE', 'Huế'),
  city('CT', 'Cần Thơ', ['Phường Ninh Kiều', 'Phường Cái Răng']),
  city('DNA', 'Đồng Nai'),
  city('BN', 'Bắc Ninh'),
  city('QN', 'Quảng Ninh'),
];

export const PROVINCES_ONLY: Province[] = [
  province('TQ', 'Tuyên Quang'),
  province('CB', 'Cao Bằng'),
  province('LC', 'Lai Châu'),
  province('LCA', 'Lào Cai'),
  province('TN', 'Thái Nguyên'),
  province('DB', 'Điện Biên'),
  province('LS', 'Lạng Sơn'),
  province('SL', 'Sơn La'),
  province('PT', 'Phú Thọ'),
  province('HY', 'Hưng Yên'),
  province('NB', 'Ninh Bình'),
  province('TH', 'Thanh Hóa'),
  province('NA', 'Nghệ An'),
  province('HT', 'Hà Tĩnh'),
  province('QT', 'Quảng Trị'),
  province('QNG', 'Quảng Ngãi'),
  province('GL', 'Gia Lai'),
  province('KH', 'Khánh Hòa'),
  province('LD', 'Lâm Đồng'),
  province('DL', 'Đắk Lắk'),
  province('TNI', 'Tây Ninh'),
  province('VL', 'Vĩnh Long'),
  province('DT', 'Đồng Tháp'),
  province('CM', 'Cà Mau'),
  province('AG', 'An Giang'),
];

/** 9 thành phố trước (Hà Nội, TP.HCM lên đầu), sau đó 25 tỉnh theo bảng chữ cái */
export const PROVINCES: Province[] = [
  ...CITIES,
  ...[...PROVINCES_ONLY].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
];
