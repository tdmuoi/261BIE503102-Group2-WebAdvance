const test = require('node:test');
const assert = require('node:assert/strict');
const { TIER_NAMES, tierName, tierLabel, tierOrderQuery, spentFromOrders } = require('./customer-tier');

test('tier thresholds match the customer site (Đồng < 1tr ≤ Bạc < 5tr ≤ Vàng)', () => {
  assert.deepEqual(TIER_NAMES, ['Đồng', 'Bạc', 'Vàng']);
  assert.equal(tierName(0), 'Đồng');
  assert.equal(tierName(999999), 'Đồng');
  assert.equal(tierName(1000000), 'Bạc');
  assert.equal(tierName(4999999), 'Bạc');
  assert.equal(tierName(5000000), 'Vàng');
  assert.equal(tierName(undefined), 'Đồng');
  assert.equal(tierLabel(1200000), 'Thành viên Bạc');
});

test('admin in-memory spend uses the same orders as the customer query', () => {
  const userId = 'u1';
  const orders = [
    { userId: 'u1', status: 'delivered', total: 600000 },
    { userId: 'u2', customer: { email: 'a@b.vn' }, status: 'delivered', total: 500000 },
    { userId: 'u1', status: 'pending', total: 9000000 },
    { userId: 'u3', status: 'delivered', total: 7000000 },
  ];
  assert.equal(spentFromOrders(orders, userId, 'a@b.vn'), 1100000);
  assert.equal(tierName(spentFromOrders(orders, userId, 'a@b.vn')), 'Bạc');
  assert.equal(spentFromOrders(orders, userId, ''), 600000);
  assert.equal(spentFromOrders(null, userId, 'a@b.vn'), 0);
});

test('Mongo query matches userId as ObjectId or string, plus the account email', () => {
  const q = tierOrderQuery('abc', 'a@b.vn');
  assert.equal(q.status, 'delivered');
  assert.deepEqual(q.$or, [{ userId: { $in: ['abc', 'abc'] } }, { 'customer.email': 'a@b.vn' }]);
  assert.equal(tierOrderQuery('abc', '').$or.length, 1);
});
