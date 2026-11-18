// =====================================================================
// Hạng thành viên — một quy tắc dùng chung cho web khách (/api/account/profile)
// và trang admin (/api/admin/accounts/customers), để hai bên luôn hiện cùng một hạng.
//   Đồng: dưới 1.000.000đ · Bạc: từ 1.000.000đ · Vàng: từ 5.000.000đ
//   Tính trên tổng tiền các đơn đã giao (status "delivered") của khách,
//   gồm đơn gắn userId và đơn đặt bằng đúng email của tài khoản.
// =====================================================================
const TIERS = [
  { name: 'Vàng', min: 5000000 },
  { name: 'Bạc', min: 1000000 },
  { name: 'Đồng', min: 0 },
];
const TIER_NAMES = ['Đồng', 'Bạc', 'Vàng'];

/** Tên hạng ngắn: 'Đồng' | 'Bạc' | 'Vàng' (admin dùng) */
function tierName(spent) {
  const value = Number(spent) || 0;
  return TIERS.find((tier) => value >= tier.min).name;
}

/** Nhãn đầy đủ cho web khách: 'Thành viên Đồng' ... */
function tierLabel(spent) {
  return `Thành viên ${tierName(spent)}`;
}

/** Điều kiện MongoDB lấy các đơn được tính hạng của một khách */
function tierOrderQuery(userId, email) {
  const owners = [{ userId: { $in: [userId, String(userId)] } }];
  if (email) owners.push({ 'customer.email': email });
  return { $or: owners, status: 'delivered' };
}

/** Cùng điều kiện như tierOrderQuery nhưng lọc trên mảng đơn đã tải sẵn */
function spentFromOrders(orders, userId, email) {
  return (orders || [])
    .filter((order) => order.status === 'delivered'
      && (String(order.userId) === String(userId) || (!!email && order.customer?.email === email)))
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
}

module.exports = { TIERS, TIER_NAMES, tierName, tierLabel, tierOrderQuery, spentFromOrders };
