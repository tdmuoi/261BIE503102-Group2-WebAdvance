import { ReturnListResponse, ReturnRequest } from '../models/return-request';

/** Yêu cầu đổi trả giả cho unit test */
export function makeReturn(overrides: Partial<ReturnRequest> = {}): ReturnRequest {
  return {
    _id: 'r1', requestCode: 'RR-001', orderId: 'o1', orderCode: 'LB-001', userId: null,
    customer: { name: 'Nguyễn Thu Hà', phone: '0911222333', email: '' },
    items: [{ bookId: 'b1', title: 'Mắt biếc', image: null, price: 100000, quantity: 1 }],
    itemsValue: 100000, type: 'refund', reason: 'damaged', description: 'Bìa bị rách', images: [],
    refundMethod: 'bank_transfer', bankInfo: null, refundAmount: null, status: 'pending',
    nextStatuses: ['approved', 'rejected'], statusHistory: [], adminNote: '', restocked: false,
    createdAt: '2026-10-27T03:00:00Z', updatedAt: null, order: null, ...overrides,
  };
}

export function makeReturnList(items: ReturnRequest[], total = items.length): ReturnListResponse {
  return {
    items, total, page: 1, limit: 10,
    counts: { all: total, open: total, pending: total, approved: 0, received: 0, refunded: 0, exchanged: 0, rejected: 0 },
    reasons: { damaged: 3, wrong_item: 1, not_as_described: 0, missing: 0, changed_mind: 0, other: 0 },
    refundedTotal: 150000,
  };
}
