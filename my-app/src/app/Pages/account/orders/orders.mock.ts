import { HttpErrorResponse } from '@angular/common/http';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';

import { CreateOrderRequest, Order, OrderItem, OrderStatus, ShippingAddress } from '../../../models/account';

// TODO: thay bằng API — my-server chưa có /api/orders và /api/account/orders.
// Khi backend xong: đổi USE_MOCK_ORDERS = false (trang Thanh toán, Đơn hàng, Tủ sách đều đọc cờ này).
export const USE_MOCK_ORDERS = true;

/** Lưu đơn mock vào localStorage để tải lại trang vẫn thấy đơn vừa đặt (chỉ dùng khi mock) */
const STORE_KEY = 'lightbook.mock.orders';

const ADDRESS: ShippingAddress = { fullName: 'Nguyễn Thùy Dung', phone: '0909123268', address: '12 Nguyễn Văn Bảo', ward: 'Phường Hạnh Thông', province: 'TP. Hồ Chí Minh' };

const OVE: OrderItem = { bookId: 'mock-ove', title: 'Người Đàn Ông Mang Tên Ove', author: 'Fredrik Backman', image: 'images/orders/cover-ove.png', price: 115000, quantity: 1, format: 'print', variant: 'Sách mới' };
const KITCHEN: OrderItem = { bookId: 'mock-kitchen-used', title: 'Kitchen', author: 'Banana Yoshimoto', image: 'images/orders/cover-kitchen.png', price: 52000, quantity: 1, format: 'print', variant: 'Sách cũ · 90% mới' };
const LU_TRE: OrderItem = { bookId: 'mock-lu-tre-3', title: 'Lũ Trẻ Hư Nhất Quả Đất 3', author: 'David Walliams', image: 'images/orders/cover-lu-tre.png', price: 240000, quantity: 2, format: 'print', variant: 'Sách mới' };
const YEU: OrderItem = { bookId: 'mock-yeu-ebook', title: 'Yêu – Being in Love', author: 'OSHO', image: 'images/orders/cover-yeu.png', price: 65000, quantity: 1, format: 'ebook', variant: 'Sách điện tử · EPUB' };
const HO_SO_MAT: OrderItem = { bookId: 'mock-ho-so-mat-ebook', title: 'Hồ Sơ Mật', author: 'Ký sự an ninh điệp báo', image: 'images/orders/cover-ho-so-mat.png', price: 59000, quantity: 1, format: 'ebook', variant: 'Sách điện tử · EPUB' };
const ROMAN_USED: OrderItem = { bookId: 'mock-roman-used', title: 'The Roman', author: 'Mika Waltari', image: 'images/orders/cover-roman.png', price: 69000, quantity: 1, format: 'print', variant: 'Sách cũ · 85% mới' };
const BCCG: OrderItem = { bookId: 'mock-bo-con-ca-gai', title: 'Bố Con Cá Gai', author: 'Cho Chang-in', image: 'images/orders/cover-bo-con-ca-gai.png', price: 98000, quantity: 1, format: 'print', variant: 'Sách mới' };

function history(steps: [OrderStatus, string][]) {
  return steps.map(([status, at]) => ({ status, at, note: null }));
}

function seed(): Order[] {
  const make = (o: Partial<Order> & Pick<Order, '_id' | 'orderCode' | 'items' | 'status' | 'createdAt'>): Order => {
    const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const physical = o.items.some((i) => i.format === 'print');
    return {
      subtotal, shippingFee: 0, discount: 0, voucherCode: null, total: subtotal,
      shippingMethod: physical ? 'standard' : null, paymentMethod: 'momo', paymentStatus: 'paid',
      statusHistory: history([['pending', o.createdAt]]), shippingAddress: physical ? ADDRESS : null, note: '', ...o,
    };
  };
  // Lấy theo Figma "Quản lý đơn hàng" (LB-24201, 24186, 24102) và "Sách đã mua" (LB-23977, 23810, 23602).
  // LB-23540 (đã huỷ) thêm vào để tab "Đã huỷ" có dữ liệu — Figma không có đơn này.
  return [
    make({ _id: 'o-24201', orderCode: 'LB-24201', items: [LU_TRE], status: 'pending', paymentMethod: 'cod', paymentStatus: 'unpaid', createdAt: '2026-10-19T09:20:00+07:00' }),
    make({
      _id: 'o-24186', orderCode: 'LB-24186', items: [OVE, KITCHEN], status: 'shipping', createdAt: '2026-10-18T14:05:00+07:00',
      statusHistory: history([['pending', '2026-10-18T14:05:00+07:00'], ['confirmed', '2026-10-18T16:30:00+07:00'], ['shipping', '2026-10-20T08:10:00+07:00']]),
    }),
    make({
      _id: 'o-24102', orderCode: 'LB-24102', items: [YEU], status: 'delivered', createdAt: '2026-10-12T10:30:00+07:00',
      statusHistory: history([['pending', '2026-10-12T10:30:00+07:00'], ['delivered', '2026-10-12T10:31:00+07:00']]),
    }),
    make({
      _id: 'o-23977', orderCode: 'LB-23977', items: [{ ...LU_TRE, quantity: 1 }], status: 'delivered', shippingFee: 30000, total: 270000, createdAt: '2026-10-02T11:00:00+07:00',
      statusHistory: history([['pending', '2026-10-02T11:00:00+07:00'], ['confirmed', '2026-10-02T13:00:00+07:00'], ['shipping', '2026-10-03T08:00:00+07:00'], ['delivered', '2026-10-05T10:00:00+07:00']]),
    }),
    make({
      _id: 'o-23810', orderCode: 'LB-23810', items: [HO_SO_MAT], status: 'delivered', paymentMethod: 'vnpay', createdAt: '2026-09-28T20:15:00+07:00',
      statusHistory: history([['pending', '2026-09-28T20:15:00+07:00'], ['delivered', '2026-09-28T20:16:00+07:00']]),
    }),
    make({
      _id: 'o-23602', orderCode: 'LB-23602', items: [ROMAN_USED], status: 'delivered', shippingFee: 30000, total: 99000, createdAt: '2026-09-15T09:40:00+07:00',
      statusHistory: history([['pending', '2026-09-15T09:40:00+07:00'], ['confirmed', '2026-09-15T11:00:00+07:00'], ['shipping', '2026-09-16T08:00:00+07:00'], ['delivered', '2026-09-18T15:00:00+07:00']]),
    }),
    make({
      _id: 'o-23540', orderCode: 'LB-23540', items: [BCCG], status: 'cancelled', shippingFee: 30000, total: 128000,
      paymentMethod: 'cod', paymentStatus: 'unpaid', createdAt: '2026-09-10T08:45:00+07:00',
      statusHistory: history([['pending', '2026-09-10T08:45:00+07:00'], ['cancelled', '2026-09-10T09:10:00+07:00']]),
    }),
  ];
}

function read(): Order[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Order[];
  } catch {
    // bỏ qua, dùng dữ liệu mẫu
  }
  return seed();
}

function write(orders: Order[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(orders));
  } catch {
    // bỏ qua
  }
}

const clone = (orders: Order[]) => orders.map((o) => structuredClone(o));

export function mockGetOrders(): Observable<Order[]> {
  return of(clone(read())).pipe(delay(400));
}

/** Thông tin bên dưới backend tự tra từ bookId/addressId — mock thì trang Thanh toán truyền sẵn */
export interface MockOrderContext {
  items: OrderItem[];
  address: ShippingAddress | null;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
}

export function mockCreateOrder(body: CreateOrderRequest, ctx: MockOrderContext): Observable<Order> {
  const orders = read();
  const nextCode = Math.max(24214, ...orders.map((o) => Number(o.orderCode.replace(/\D/g, '')) || 0)) + 1;
  const now = new Date().toISOString();
  const ebookOnly = ctx.items.every((i) => i.format === 'ebook');
  const order: Order = {
    _id: `o-${nextCode}`,
    orderCode: `LB-${nextCode}`,
    items: ctx.items,
    subtotal: ctx.subtotal,
    shippingFee: ctx.shippingFee,
    discount: ctx.discount,
    voucherCode: body.voucherCode,
    total: ctx.total,
    shippingMethod: body.shippingMethod,
    paymentMethod: body.paymentMethod,
    // Chưa nối cổng thanh toán thật: MoMo / VNPay / chuyển khoản coi như đã trả, COD trả khi nhận
    paymentStatus: body.paymentMethod === 'cod' ? 'unpaid' : 'paid',
    // Đơn chỉ có ebook: giao ngay vào tủ sách
    status: ebookOnly ? 'delivered' : 'pending',
    statusHistory: ebookOnly ? history([['pending', now], ['delivered', now]]) : history([['pending', now]]),
    shippingAddress: ctx.address,
    note: body.note,
    createdAt: now,
  };
  write([order, ...orders]);
  return of(structuredClone(order)).pipe(delay(700));
}

export function mockCancelOrder(id: string): Observable<Order> {
  const orders = read();
  const order = orders.find((o) => o._id === id);
  if (!order || order.status !== 'pending') {
    return timer(400).pipe(switchMap(() => throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Đơn đã được xác nhận nên không huỷ được nữa' } }))));
  }
  order.status = 'cancelled';
  order.statusHistory.push({ status: 'cancelled', at: new Date().toISOString(), note: 'Khách huỷ đơn' });
  write(orders);
  return of(structuredClone(order)).pipe(delay(400));
}

/** Yêu cầu thanh lý sách — tab "Thanh lý" ở Quản lý đơn hàng */
export interface BuybackRequest {
  code: string;
  createdAt: string;
  bookCount: number;
  status: 'reviewing' | 'quoted' | 'completed';
  quote: number | null;
  note: string;
}

// TODO: thay bằng API — chưa có GET /api/account/buybacks (trang Thanh lý sách của bạn khác làm)
export function mockGetBuybacks(): Observable<BuybackRequest[]> {
  return of<BuybackRequest[]>([
    { code: 'TL-1024', createdAt: '2026-10-27T15:00:00+07:00', bookCount: 3, status: 'quoted', quote: 156000, note: 'Chọn nhận tiền hoặc voucher +10% trong 48 giờ.' },
  ]).pipe(delay(400));
}

/** Dùng trong test: xoá đơn mock đã lưu, quay về dữ liệu mẫu */
export function resetMockOrders(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // bỏ qua
  }
}
