import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth-service';

/**
 * Chặn trang cần đăng nhập (Tài khoản, ...). Chưa đăng nhập thì chuyển về
 * /login?returnUrl=<trang đang mở> để đăng nhập xong quay lại đúng chỗ.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
