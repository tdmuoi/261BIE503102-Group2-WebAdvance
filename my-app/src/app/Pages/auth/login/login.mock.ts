import { HttpErrorResponse } from '@angular/common/http';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';

import { AuthResponse, LoginRequest } from '../../../models/user';

// TODO: thay bằng API — my-server chưa có POST /api/auth/login.
// Khi backend xong: đổi USE_MOCK_LOGIN = false (hoặc xoá file này và nhánh mock trong login.ts).
export const USE_MOCK_LOGIN = true;

/** Tài khoản thử: demo@lightbook.vn hoặc 0901234567, mật khẩu lightbook123 */
const MOCK_ACCOUNT = {
  email: 'demo@lightbook.vn',
  phone: '0901234567',
  password: 'lightbook123',
  user: { _id: 'mock-user-1', fullName: 'Mai Trần', email: 'demo@lightbook.vn', phone: '0901234567' },
};

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

let failedAttempts = 0;
let lockedUntil = 0;

/** Giả lập server: sai 5 lần thì khoá 15 phút, trả lỗi đúng dạng API đề xuất */
export function mockLogin(req: LoginRequest): Observable<AuthResponse> {
  if (Date.now() < lockedUntil) {
    return fail(423, { lockedUntil: new Date(lockedUntil).toISOString() });
  }
  const id = req.identifier.trim().toLowerCase();
  const matched = req.type === 'email' ? id === MOCK_ACCOUNT.email : id === MOCK_ACCOUNT.phone;
  if (matched && req.password === MOCK_ACCOUNT.password) {
    failedAttempts = 0;
    return of({ token: 'mock-token', user: MOCK_ACCOUNT.user }).pipe(delay(600));
  }
  failedAttempts++;
  if (failedAttempts >= MAX_ATTEMPTS) {
    failedAttempts = 0;
    lockedUntil = Date.now() + LOCK_MS;
    return fail(423, { lockedUntil: new Date(lockedUntil).toISOString() });
  }
  return fail(401, { remainingAttempts: MAX_ATTEMPTS - failedAttempts });
}

function fail(status: number, error: object): Observable<never> {
  // delay() không áp dụng cho lỗi nên dùng timer để giả lập độ trễ mạng
  return timer(600).pipe(switchMap(() => throwError(() => new HttpErrorResponse({ status, error }))));
}
