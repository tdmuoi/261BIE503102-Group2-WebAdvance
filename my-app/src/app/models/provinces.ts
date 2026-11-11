import { Province } from './account';

/**
 * Tỉnh/thành + phường/xã cho form địa chỉ (2 cấp, sau sáp nhập 01/07/2025).
 * TODO: my-server chưa có API địa giới hành chính — hiện mới có vài tỉnh/thành mẫu, cần bổ sung đủ danh sách.
 */
export const PROVINCES: Province[] = [
  { code: 'HCM', name: 'TP. Hồ Chí Minh', wards: ['Phường Sài Gòn', 'Phường Bến Thành', 'Phường Gò Vấp', 'Phường Hạnh Thông', 'Phường Linh Xuân', 'Phường Thủ Đức', 'Phường Dĩ An'] },
  { code: 'HN', name: 'TP. Hà Nội', wards: ['Phường Hoàn Kiếm', 'Phường Ba Đình', 'Phường Cầu Giấy', 'Phường Đống Đa'] },
  { code: 'DN', name: 'TP. Đà Nẵng', wards: ['Phường Hải Châu', 'Phường Sơn Trà', 'Phường Hội An'] },
  { code: 'CT', name: 'TP. Cần Thơ', wards: ['Phường Ninh Kiều', 'Phường Cái Răng'] },
];
