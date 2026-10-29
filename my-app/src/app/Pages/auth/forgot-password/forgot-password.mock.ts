import { Observable, delay, of } from 'rxjs';

import { ForgotPasswordResponse } from '../../../models/user';

// TODO: thay bằng API — my-server chưa có POST /api/auth/forgot-password.
// Khi backend xong: đổi USE_MOCK_FORGOT = false (hoặc xoá file này và nhánh mock trong forgot-password.ts).
export const USE_MOCK_FORGOT = true;

/** Server luôn trả thành công (không cho biết email có tài khoản hay không) */
export function mockForgotPassword(_email: string): Observable<ForgotPasswordResponse> {
  return of({ resendAfter: 30 }).pipe(delay(600));
}
