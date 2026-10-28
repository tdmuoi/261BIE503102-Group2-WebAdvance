import { Order } from '../models/order';

/** Đơn hàng giả cho unit test */
export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    _id: 'o1', orderCode: 'LB-001', userId: null, customer: { name: 'Nguyễn Thu Hà', email: '', phone: '0911222333' },
    shippingAddress: null, items: [{ bookId: 'b1', title: 'Mắt biếc', image: null, price: 100000, quantity: 2, format: 'print' }],
    itemCount: 2, onlyEbooks: false, subtotal: 200000, shippingFee: 25000, discount: 0, voucherCode: null, total: 225000,
    paymentMethod: 'cod', paymentStatus: 'unpaid', status: 'pending', nextStatuses: ['confirmed', 'cancelled'],
    statusHistory: [], note: '', adminNote: '', trackingCode: '', stockDeducted: false, restocked: false,
    createdAt: '2026-10-27T03:00:00Z', updatedAt: null, ...overrides,
  };
}
