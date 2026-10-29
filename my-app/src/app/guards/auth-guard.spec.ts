import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { AuthService } from '../services/auth-service';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  const run = (loggedIn: boolean) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } }],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/account/orders' } as RouterStateSnapshot),
    );
  };

  it('đã đăng nhập thì cho vào', () => {
    expect(run(true)).toBe(true);
  });

  it('chưa đăng nhập thì chuyển về /login kèm returnUrl', () => {
    const result = run(false) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2Faccount%2Forders');
  });
});
