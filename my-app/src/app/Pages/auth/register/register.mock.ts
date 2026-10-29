import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, delay, switchMap, throwError, timer } from 'rxjs';

import { RegisterRequest, RegisterResponse } from '../../../models/user';

// TODO: thay bằng API — my-server chưa có POST /api/auth/register.
// Khi backend xong: đổi USE_MOCK_REGISTER = false (hoặc xoá file này và nhánh mock trong register.ts).
export const USE_MOCK_REGISTER = true;

/** Email / SĐT coi như đã có người dùng (trùng tài khoản thử ở login.mock.ts) */
const TAKEN_EMAILS = ['demo@lightbook.vn'];
const TAKEN_PHONES = ['0901234567'];

export function mockRegister(req: RegisterRequest): Observable<RegisterResponse> {
  const email = req.email.trim().toLowerCase();
  if (TAKEN_EMAILS.includes(email)) {
    return fail({ field: 'email', message: 'Email này đã được đăng ký' });
  }
  if (req.phone && TAKEN_PHONES.includes(req.phone)) {
    return fail({ field: 'phone', message: 'Số điện thoại này đã được đăng ký' });
  }
  return of({
    token: 'mock-token',
    user: { _id: `mock-${Date.now()}`, fullName: req.fullName.trim(), email, phone: req.phone },
    coupon: { code: 'LIGHTBOOK10' },
  }).pipe(delay(600));
}

function fail(error: object): Observable<never> {
  // delay() không áp dụng cho lỗi nên dùng timer để giả lập độ trễ mạng
  return timer(600).pipe(switchMap(() => throwError(() => new HttpErrorResponse({ status: 409, error }))));
}
