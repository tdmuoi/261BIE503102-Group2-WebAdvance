import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { App } from './app';
import { AppRoutingModule } from './app-routing-module';
import { pendingChangesGuard } from './Pages/settings/pending-changes-guard';
import { adminAuthGuard, adminAuthChildGuard } from './services/admin-auth-service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RouterOutlet,
        AppRoutingModule
      ],
      declarations: [
        App
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the routing outlet and register the application guards', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
    const adminRoute = TestBed.inject(Router).config.find((route) => route.path === '');
    expect(adminRoute?.canActivate).toEqual([adminAuthGuard]);
    expect(adminRoute?.canActivateChild).toEqual([adminAuthChildGuard]);
    for (const path of ['news-editor', 'news-editor/:id', 'settings']) {
      const route = adminRoute?.children?.find((child) => child.path === path);
      expect(route?.canDeactivate).toEqual([pendingChangesGuard]);
    }
  });
});
