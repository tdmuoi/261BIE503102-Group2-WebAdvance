import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';

import { AccountNotification, AccountProfile, Address, Order, OrderItem, OrderStatus, ShippingAddress } from '../models/account';
import { LibraryEbook } from '../Pages/account/bookshelf-ebooks/library';

/**
 * CHỈ DÙNG TRONG TEST (*.spec.ts): giả lập các API khách hàng của my-server (routes/customer-*.js)
 * bằng một HttpInterceptor, để test chạy service thật mà không cần server.
 * Mỗi lần gọi provideFakeCustomerApi() là một "database" mới, dữ liệu mẫu theo Figma.
 *
 *   providers: [provideFakeCustomerApi()]          // mọi request trả sau 300ms
 *   const api = fakeCustomerApi();  providers: [api.providers]  → đọc / sửa api.db trong test
 */
export const FAKE_DELAY = 300;

export const FAKE_USER = { _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'dung@lightbook.vn', phone: '0909123268', avatar: null };
const DEMO_LOGIN = { email: 'demo@lightbook.vn', phone: '0901234567', password: 'lightbook123' };

const ADDRESS: ShippingAddress = { fullName: 'Nguyễn Thùy Dung', phone: '0909123268', address: '12 Nguyễn Văn Bảo', ward: 'Phường Hạnh Thông', province: 'TP. Hồ Chí Minh' };
const item = (bookId: string, title: string, author: string, price: number, format: 'print' | 'ebook', variant: string, quantity = 1): OrderItem =>
  ({ bookId, title, author, image: `images/orders/cover-${bookId}.png`, price, quantity, format, variant });
const OVE = item('ove', 'Người Đàn Ông Mang Tên Ove', 'Fredrik Backman', 115000, 'print', 'Sách mới');
const KITCHEN_USED = item('kitchen-used', 'Kitchen', 'Banana Yoshimoto', 52000, 'print', 'Sách cũ · 90% mới');
const LU_TRE = item('lu-tre-3', 'Lũ Trẻ Hư Nhất Quả Đất 3', 'David Walliams', 240000, 'print', 'Sách mới', 2);
const YEU = item('yeu-ebook', 'Yêu – Being in Love', 'OSHO', 65000, 'ebook', 'Sách điện tử · EPUB');
const HO_SO_MAT = item('ho-so-mat-ebook', 'Hồ Sơ Mật', 'Ký sự an ninh điệp báo', 59000, 'ebook', 'Sách điện tử · EPUB');
const ROMAN_USED = item('roman-used', 'The Roman', 'Mika Waltari', 69000, 'print', 'Sách cũ · 85% mới');
const BCCG = item('bo-con-ca-gai', 'Bố Con Cá Gai', 'Cho Chang-in', 98000, 'print', 'Sách mới');

const history = (steps: [OrderStatus, string][]) => steps.map(([status, at]) => ({ status, at, note: null }));

function order(o: Partial<Order> & Pick<Order, '_id' | 'orderCode' | 'items' | 'status' | 'createdAt'>): Order {
  const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const physical = o.items.some((i) => i.format === 'print');
  return {
    subtotal, shippingFee: 0, discount: 0, voucherCode: null, total: subtotal, shippingMethod: physical ? 'standard' : null,
    paymentMethod: 'momo', paymentStatus: 'paid', statusHistory: history([['pending', o.createdAt]]),
    shippingAddress: physical ? ADDRESS : null, note: '', ...o,
  };
}

function seedOrders(): Order[] {
  return [
    order({ _id: 'o-24201', orderCode: 'LB-24201', items: [LU_TRE], status: 'pending', paymentMethod: 'cod', paymentStatus: 'unpaid', createdAt: '2026-10-19T09:20:00+07:00' }),
    order({
      _id: 'o-24186', orderCode: 'LB-24186', items: [OVE, KITCHEN_USED], status: 'shipping', createdAt: '2026-10-18T14:05:00+07:00',
      statusHistory: history([['pending', '2026-10-18T14:05:00+07:00'], ['confirmed', '2026-10-18T16:30:00+07:00'], ['shipping', '2026-10-20T08:10:00+07:00']]),
    }),
    order({ _id: 'o-24102', orderCode: 'LB-24102', items: [YEU], status: 'delivered', createdAt: '2026-10-12T10:30:00+07:00' }),
    order({ _id: 'o-23977', orderCode: 'LB-23977', items: [{ ...LU_TRE, quantity: 1 }], status: 'delivered', shippingFee: 30000, total: 270000, createdAt: '2026-10-02T11:00:00+07:00' }),
    order({ _id: 'o-23810', orderCode: 'LB-23810', items: [HO_SO_MAT], status: 'delivered', paymentMethod: 'vnpay', createdAt: '2026-09-28T20:15:00+07:00' }),
    order({ _id: 'o-23602', orderCode: 'LB-23602', items: [ROMAN_USED], status: 'delivered', shippingFee: 30000, total: 99000, createdAt: '2026-09-15T09:40:00+07:00' }),
    order({ _id: 'o-23540', orderCode: 'LB-23540', items: [BCCG], status: 'cancelled', paymentMethod: 'cod', paymentStatus: 'unpaid', createdAt: '2026-09-10T08:45:00+07:00' }),
  ];
}

/** Câu tô sáng mẫu trong "Kitchen" (Figma Đọc ebook) */
const KITCHEN_QUOTE = 'Khi đọc, người dùng có thể bôi đen một câu để tô sáng, thêm ghi chú hoặc tra từ.';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
function ebook(bookId: string, title: string, author: string, page: number, totalPages: number, lastReadAt: string | null, format: 'EPUB' | 'PDF' = 'EPUB'): LibraryEbook {
  return {
    bookId, title, author, image: `images/orders/cover-${bookId}.png`, format, page, totalPages, lastReadAt,
    progress: Math.round((page / totalPages) * 100), purchasedAt: '2026-10-01T10:00:00+07:00', sizes: { EPUB: 2.1, PDF: 8.4 },
  };
}

function seedEbooks(): LibraryEbook[] {
  return [
    ebook('kitchen-ebook', 'Kitchen', 'Banana Yoshimoto', 58, 140, hoursAgo(2)),
    ebook('ho-so-mat-ebook', 'Hồ Sơ Mật', 'Ký sự an ninh điệp báo', 243, 320, hoursAgo(30)),
    ebook('ove-ebook', 'Người Đàn Ông Mang Tên Ove', 'Fredrik Backman', 54, 452, hoursAgo(72)),
    ebook('yeu-ebook', 'Yêu – Being in Love', 'OSHO', 268, 268, hoursAgo(120)),
    ebook('nhung-mien-linh-di', 'Những Miền Linh Dị', 'Dương Hành Triết', 0, 384, null, 'PDF'),
    ebook('roman-ebook', 'The Roman', 'Mika Waltari', 0, 512, null, 'PDF'),
  ];
}

function seedNotifications(): AccountNotification[] {
  const n = (i: number, type: AccountNotification['type'], icon: AccountNotification['icon'], title: string, hours: number, read: boolean, link?: string): AccountNotification =>
    ({ _id: `n${i}`, type, icon, title, message: `${title} — chi tiết`, createdAt: hoursAgo(hours), read, action: link ? { label: 'Xem', link } : null });
  return [
    n(1, 'order', 'truck', 'Đơn #LB-24186 đang được giao', 2, false, '/account/orders'),
    n(2, 'buyback', 'recycle', 'Yêu cầu thanh lý đã có báo giá', 5, false, '/book-buyback'),
    n(3, 'bookshelf', 'book', 'Ebook mới đã vào tủ sách', 8, false, '/account/bookshelf-ebooks'),
    n(4, 'promo', 'tag', 'Flash sale 20:00 – 23:00 tối nay', 26, true),
    n(5, 'promo', 'heart', 'Sách trong wishlist đang giảm giá', 50, true, '/account/wishlist'),
    n(6, 'order', 'box', 'Đơn #LB-24102 đã hoàn tất', 200, true),
    n(7, 'bookshelf', 'book', 'Ebook “Kitchen” đã vào tủ sách', 400, true),
    n(8, 'order', 'box', 'Đơn #LB-23977 đã hoàn tất', 600, true),
  ];
}

export interface FakeDb {
  profile: AccountProfile;
  addresses: Address[];
  orders: Order[];
  ebooks: LibraryEbook[];
  notifications: AccountNotification[];
  ratings: Record<string, number>;
  wishlist: { bookId: string; title: string; image: string; price: number; addedAt: string; author?: string; originalPrice?: number }[];
  progress: Record<string, unknown>;
  failedLogins: number;
  /** Ghi lại mọi request (method + đường dẫn sau /api) để test kiểm tra */
  calls: string[];
}

function seed(): FakeDb {
  return {
    profile: {
      _id: FAKE_USER._id, fullName: FAKE_USER.fullName, username: 'dung', email: FAKE_USER.email, emailVerified: true, phone: FAKE_USER.phone,
      birthday: '2005-02-14', gender: 'female', avatar: null, tier: 'Thành viên Bạc', memberId: '7904217',
      passwordChangedAt: '2026-09-02T08:00:00.000Z', twoFactorEnabled: true,
    },
    addresses: [
      { _id: 'addr-1', fullName: 'Nguyễn Thùy Dung', phone: '0909123268', province: 'TP. Hồ Chí Minh', ward: 'Phường Hạnh Thông', street: '12 Nguyễn Văn Bảo', type: 'home', isDefault: true },
      { _id: 'addr-2', fullName: 'Nguyễn Thùy Dung', phone: '0909123268', province: 'TP. Hồ Chí Minh', ward: 'Phường Linh Xuân', street: '669 Quốc lộ 1, Khu phố 3', type: 'school', isDefault: false },
    ],
    orders: seedOrders(),
    ebooks: seedEbooks(),
    notifications: seedNotifications(),
    ratings: { 'roman-used': 5 },
    wishlist: [],
    progress: {
      'kitchen-ebook': {
        page: 58, bookmarks: [23, 47], lastReadAt: hoursAgo(2),
        notes: [{ id: 'n-seed', page: 58, quote: KITCHEN_QUOTE, text: '' }],
        highlights: [{ page: 58, text: KITCHEN_QUOTE }],
      },
    },
    failedLogins: 0,
    calls: [],
  };
}

type Reply = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Reply => ({ status, body });
const fail = (status: number, body: object): Reply => ({ status, body });

function sortAddresses(list: Address[], defaultId?: string): Address[] {
  const id = defaultId ?? list.find((a) => a.isDefault)?._id ?? list[0]?._id;
  return list.map((a) => ({ ...a, isDefault: a._id === id })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Xử lý một request giống my-server */
function handle(db: FakeDb, req: HttpRequest<unknown>): Reply | null {
  const url = new URL(req.urlWithParams, 'http://x');
  const idx = url.pathname.indexOf('/api/');
  if (idx < 0) return null;
  const path = url.pathname.slice(idx + 4);
  const m = req.method;
  const body = (req.body ?? {}) as Record<string, any>;
  const authed = !!req.headers.get('Authorization');
  db.calls.push(`${m} ${path}`);
  const seg = path.split('/').filter(Boolean);

  // ---- Đăng nhập / đăng ký (không cần token) ----
  if (m === 'POST' && path === '/auth/login') {
    const id = String(body['identifier'] ?? '').trim().toLowerCase();
    const matched = body['type'] === 'phone' ? id === DEMO_LOGIN.phone : id === DEMO_LOGIN.email;
    if (matched && body['password'] === DEMO_LOGIN.password) {
      db.failedLogins = 0;
      return ok({ token: 'f'.repeat(64), user: { ...FAKE_USER, email: DEMO_LOGIN.email } });
    }
    db.failedLogins++;
    if (db.failedLogins >= 5) {
      db.failedLogins = 0;
      return fail(423, { lockedUntil: new Date(Date.now() + 15 * 60_000).toISOString() });
    }
    return fail(401, { remainingAttempts: 5 - db.failedLogins });
  }
  if (m === 'POST' && path === '/auth/register') {
    if (String(body['email']).toLowerCase() === DEMO_LOGIN.email) return fail(409, { field: 'email', message: 'Email này đã được đăng ký' });
    if (body['phone'] === DEMO_LOGIN.phone) return fail(409, { field: 'phone', message: 'Số điện thoại này đã được đăng ký' });
    return ok({ token: 'f'.repeat(64), user: { _id: 'u-new', fullName: body['fullName'], email: body['email'], phone: body['phone'] }, coupon: { code: 'WELCOME10' } }, 201);
  }
  if (m === 'POST' && path === '/auth/forgot-password') return ok({ message: 'ok', resendAfter: 30 });
  if (m === 'POST' && path === '/auth/logout') return ok({ message: 'Đã đăng xuất' });

  if (!authed) return fail(401, { message: 'Bạn cần đăng nhập để tiếp tục' });

  // ---- Hồ sơ ----
  if (path === '/account/profile') {
    if (m === 'PUT') db.profile = { ...db.profile, ...body };
    return ok({ ...db.profile });
  }
  if (path === '/account/avatar') {
    db.profile = { ...db.profile, avatar: m === 'PUT' ? String(body['avatar']) : null };
    return m === 'PUT' ? ok({ avatar: db.profile.avatar }) : ok(null, 204);
  }
  if (m === 'PUT' && path === '/account/password') {
    if (body['currentPassword'] === 'sai-mat-khau') return fail(400, { field: 'currentPassword', message: 'Mật khẩu hiện tại chưa đúng' });
    db.profile.passwordChangedAt = new Date().toISOString();
    return ok({ passwordChangedAt: db.profile.passwordChangedAt });
  }

  // ---- Sổ địa chỉ ----
  if (seg[0] === 'account' && seg[1] === 'addresses') {
    const id = seg[2];
    if (m === 'GET') return ok(db.addresses);
    if (m === 'POST') {
      const created = { ...(body as Address), _id: `addr-${db.addresses.length + 1}-${Date.now()}` };
      db.addresses = sortAddresses([...db.addresses, created], body['isDefault'] || !db.addresses.length ? created._id : undefined);
      return ok(db.addresses, 201);
    }
    if (!db.addresses.some((a) => a._id === id)) return fail(404, { message: 'Không tìm thấy địa chỉ' });
    if (m === 'PUT' && seg[3] === 'default') db.addresses = sortAddresses(db.addresses, id);
    else if (m === 'PUT') db.addresses = sortAddresses(db.addresses.map((a) => (a._id === id ? { ...(body as Address), _id: id } : a)), body['isDefault'] ? id : undefined);
    else if (m === 'DELETE') db.addresses = sortAddresses(db.addresses.filter((a) => a._id !== id));
    return ok(db.addresses);
  }

  // ---- Thông báo ----
  if (seg[0] === 'account' && seg[1] === 'notifications') {
    if (m === 'GET') {
      const type = url.searchParams.get('type') ?? 'all';
      const page = Number(url.searchParams.get('page') ?? 1);
      const list = db.notifications.filter((n) => type === 'all' || n.type === type).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const items = list.slice(0, page * 6).map((n) => ({ ...n }));
      return ok({ items, total: list.length, unread: db.notifications.filter((n) => !n.read).length, hasMore: list.length > items.length });
    }
    if (seg[2] === 'read-all') {
      db.notifications = db.notifications.map((n) => ({ ...n, read: true }));
      return ok({ unread: 0 });
    }
    db.notifications = db.notifications.map((n) => (n._id === seg[2] ? { ...n, read: true } : n));
    return ok(db.notifications.find((n) => n._id === seg[2]));
  }

  // ---- Mã giảm giá ----
  if (m === 'POST' && path === '/vouchers/apply') {
    const code = String(body['code'] ?? '').toUpperCase();
    if (code === 'WELCOME10') return ok({ code, type: 'percent', value: 10, maxDiscount: null, minOrderValue: 0, description: 'giảm 10% cho đơn đầu tiên' });
    if (code === 'FREESHIP') return ok({ code, type: 'freeship', value: 0, maxDiscount: null, minOrderValue: 0, description: 'miễn phí vận chuyển' });
    return fail(404, { message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' });
  }

  // ---- Đơn hàng ----
  if (m === 'GET' && path === '/account/orders') return ok(structuredClone(db.orders));
  if (m === 'POST' && path === '/orders') {
    const items = (body['items'] as { bookId: string; quantity: number }[]).map((i) => ({
      bookId: i.bookId, title: `Sách ${i.bookId}`, image: null, price: 100000, quantity: i.quantity,
      format: i.bookId.startsWith('e') ? ('ebook' as const) : ('print' as const),
    }));
    const now = new Date().toISOString();
    const created = order({
      _id: `o-new-${db.orders.length}`, orderCode: `LB-2611${db.orders.length}`, items, status: 'pending', createdAt: now,
      paymentMethod: body['paymentMethod'], paymentStatus: 'unpaid', shippingMethod: body['shippingMethod'], voucherCode: body['voucherCode'], note: body['note'] ?? '',
    });
    db.orders = [created, ...db.orders];
    return ok(structuredClone(created), 201);
  }
  if (seg[0] === 'orders' || (seg[0] === 'account' && seg[1] === 'orders')) {
    const id = seg[0] === 'orders' ? seg[1] : seg[2];
    const found = db.orders.find((o) => o._id === id);
    if (!found) return fail(404, { message: 'Không tìm thấy đơn hàng' });
    if (m === 'PUT' && seg[3] === 'cancel') {
      if (found.status !== 'pending') return fail(409, { message: 'Đơn đã được xác nhận nên không huỷ được nữa' });
      found.status = 'cancelled';
      found.statusHistory.push({ status: 'cancelled', at: new Date().toISOString(), note: 'Khách huỷ đơn' });
    }
    if (m === 'POST' && seg[2] === 'confirm-payment') {
      found.paymentStatus = 'paid';
      if (found.items.every((i) => i.format === 'ebook')) found.status = 'delivered';
    }
    return ok(structuredClone(found));
  }

  // ---- Tủ sách, đánh giá, thanh lý ----
  if (m === 'GET' && path === '/account/ebooks') return ok(structuredClone(db.ebooks));
  if (seg[0] === 'account' && seg[1] === 'ebooks' && seg[3] === 'progress') {
    if (!db.ebooks.some((e) => e.bookId === seg[2])) return fail(404, { message: 'Ebook không có trong tủ sách của bạn' });
    if (m === 'PUT') {
      db.progress[seg[2]] = { ...body, lastReadAt: new Date().toISOString() };
      return ok({ ok: true });
    }
    return db.progress[seg[2]] ? ok(db.progress[seg[2]]) : ok({ page: 1, bookmarks: [], notes: [], highlights: [], lastReadAt: null });
  }
  if (m === 'GET' && path === '/account/reviews') return ok({ ...db.ratings });
  if (m === 'POST' && path === '/reviews') {
    db.ratings[String(body['bookId'])] = Number(body['rating']);
    return ok({ bookId: body['bookId'], rating: body['rating'] }, 201);
  }
  if (m === 'GET' && path === '/account/buybacks') {
    return ok([{ code: 'TL-1024', createdAt: '2026-10-27T15:00:00+07:00', bookCount: 3, status: 'quoted', quote: 156000, note: 'Chọn nhận tiền hoặc voucher +10% trong 48 giờ.' }]);
  }

  // ---- Wishlist ----
  if (seg[0] === 'wishlist') {
    if (m === 'POST' && !db.wishlist.some((w) => w.bookId === seg[1])) {
      db.wishlist.unshift({ bookId: seg[1], title: `Sách ${seg[1]}`, image: '', price: 100000, addedAt: new Date().toISOString() });
    }
    if (m === 'DELETE') db.wishlist = db.wishlist.filter((w) => w.bookId !== seg[1]);
    return ok(structuredClone(db.wishlist), m === 'POST' ? 201 : 200);
  }
  return null;
}

export function fakeCustomerApi(delayMs = FAKE_DELAY): { db: FakeDb; providers: EnvironmentProviders } {
  const db = seed();
  const interceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<any> => {
    const reply = handle(db, req);
    if (!reply) return next(req);
    if (reply.status >= 400) {
      return timer(delayMs).pipe(switchMap(() => throwError(() => new HttpErrorResponse({ status: reply.status, error: reply.body, url: req.url }))));
    }
    return of(new HttpResponse({ status: reply.status, body: reply.body, url: req.url })).pipe(delay(delayMs));
  };
  return { db, providers: provideHttpClient(withInterceptors([interceptor])) };
}

export function provideFakeCustomerApi(delayMs = FAKE_DELAY): EnvironmentProviders {
  return fakeCustomerApi(delayMs).providers;
}

/** Ghi phiên đăng nhập vào localStorage trước khi tạo AuthService (token 64 ký tự như server) */
export function signInForTest(user: object = FAKE_USER): void {
  localStorage.setItem('lightbook.auth', JSON.stringify({ token: 'f'.repeat(64), user }));
}
