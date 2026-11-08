import { canAccessRoute, landingPage, routePermission } from './admin-route-access';
import { AdminUser } from '../models/admin-auth';

const user = (module: string, actions = ['view']): AdminUser => ({
  _id: 'fixture', fullName: 'Fixture', email: 'fixture@example.invalid', role: 'admin',
  permissions: [{ module, actions }],
});

describe('Admin navigation permissions', () => {
  it('separates inventory from product access and picks an authorized landing page', () => {
    const warehouse = user('inventory');
    expect(canAccessRoute(warehouse, '/inventory')).toBe(true);
    expect(canAccessRoute(warehouse, '/book-list')).toBe(false);
    expect(canAccessRoute(warehouse, '/dashboard')).toBe(false);
    expect(landingPage(warehouse)).toBe('/inventory');
  });
  it('checks create and update independently of view access', () => {
    expect(canAccessRoute(user('products'), '/book-form')).toBe(false);
    expect(canAccessRoute(user('products', ['create']), '/book-form')).toBe(true);
    expect(canAccessRoute(user('products', ['create']), '/book-form/id')).toBe(false);
    expect(routePermission('/news-editor/id?tab=body')).toEqual(['content', 'update']);
    expect(routePermission('/news-editor')).toEqual(['content', 'create']);
  });
  it('uses distinct customer/account rights and denies an unprivileged session', () => {
    expect(canAccessRoute(user('customers'), '/accounts')).toBe(true);
    expect(canAccessRoute(user('customers'), '/users-roles')).toBe(false);
    expect(landingPage({ ...user('none'), permissions: [] })).toBe('/access-denied');
    expect(canAccessRoute(null, '/inventory')).toBe(false);
  });
  it('permits superadmin navigation and authenticated access to the denial page', () => {
    expect(landingPage({ ...user('none'), role: 'superadmin' })).toBe('/dashboard');
    expect(canAccessRoute(user('none'), '/access-denied')).toBe(true);
  });
});
