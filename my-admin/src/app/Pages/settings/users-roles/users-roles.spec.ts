import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UsersRoles } from './users-roles';
import { FormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { Accounts } from '../../accounts/accounts';
import { Pagination } from '../../../Components/pagination/pagination';
import { ConfirmDialog } from '../../../Components/confirm-dialog/confirm-dialog';
import { environment } from '../../../../environments/environment';

describe('UsersRoles', () => {
  let component: UsersRoles;
  let fixture: ComponentFixture<UsersRoles>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UsersRoles, Accounts, Pagination, ConfirmDialog],
      imports: [FormsModule, RouterModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersRoles);
    http = TestBed.inject(HttpTestingController);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(environment.apiUrl + '/admin/auth/session').flush({
      user: { _id: 'root', role: 'superadmin' }, csrfToken: 'csrf',
      expiresAt: '2099-01-01T00:00:00Z',
    });
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    const request = http.expectOne((req) => req.url === environment.apiUrl + '/admin/accounts/admins');
    expect(request.request.withCredentials).toBe(true);
    request.flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectNone((req) => req.url === environment.apiUrl + '/admin/accounts/customers');
  });
  it('uses the existing account permission error without exposing placeholder content', async () => {
    http.expectOne((req) => req.url.endsWith('/admin/accounts/admins'))
      .flush({}, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('users-roles works!');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });
});
