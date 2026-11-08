import { AdminUser } from '../models/admin-auth';

/** UI navigation follows the same module/action names as the protected APIs. */
export function routePermission(url: string): [string, string] | null {
  const [page, id] = url.split(/[?#]/)[0].split('/').filter(Boolean);
  const modules: Record<string, string> = {
    dashboard: 'dashboard', 'book-list': 'products', inventory: 'inventory',
    orders: 'orders', 'order-detail': 'orders', refunds: 'orders',
    banners: 'banners', vouchers: 'vouchers', 'news-list': 'content',
    accounts: 'customers', 'customer-detail': 'customers',
    'users-roles': 'accounts', settings: 'settings',
    'buyback-requests': 'liquidation', 'buyback-detail': 'liquidation',
  };
  if (page === 'book-form') return ['products', id ? 'update' : 'create'];
  if (page === 'news-editor') return ['content', id ? 'update' : 'create'];
  return modules[page] ? [modules[page], 'view'] : null;
}

export function canAccessRoute(user: AdminUser | null, url: string): boolean {
  if (!user) return false;
  const permission = routePermission(url);
  return !permission || user.role === 'superadmin' || !!user.permissions?.some(
    (entry) => entry.module === permission[0] && entry.actions.includes(permission[1]),
  );
}

export function landingPage(user: AdminUser | null): string {
  return ['/dashboard', '/book-list', '/inventory', '/orders', '/refunds',
    '/buyback-requests', '/banners', '/vouchers', '/news-list', '/accounts',
    '/users-roles', '/settings'].find((url) => canAccessRoute(user, url)) ?? '/access-denied';
}
