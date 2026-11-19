// =====================================================================
// Hạng thành viên — một quy tắc dùng chung cho web khách (/api/account/profile)
// =====================================================================
const TIERS = [
  { name: 'Vàng', min: 5000000 },
  { name: 'Bạc', min: 1000000 },
  { name: 'Đồng', min: 0 },
];
const TIER_NAMES = ['Đồng', 'Bạc', 'Vàng'];

function tierName(spent) {
  const value = Number(spent) || 0;
  return TIERS.find((tier) => value >= tier.min).name;
}

function tierLabel(spent) {
  return `Thành viên ${tierName(spent)}`;
}

function tierOrderQuery(userId, email) {
  const owners = [{ userId: { $in: [userId, String(userId)] } }];
  if (email) owners.push({ 'customer.email': email });
  return { $or: owners, status: 'delivered' };
}

function spentFromOrders(orders, userId, email) {
  return (orders || [])
    .filter((order) => order.status === 'delivered'
      && (String(order.userId) === String(userId) || (!!email && order.customer?.email === email)))
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
}

module.exports = { TIERS, TIER_NAMES, tierName, tierLabel, tierOrderQuery, spentFromOrders };
