// =====================================================================
// API cho trang Dashboard của my-admin
//   GET /api/admin/dashboard?days=7      (days: 1 - 90, mặc định 7)
//
// Gắn vào index.js:
//   const adminDashboardRoutes = require('./routes/admin-dashboard');
//   app.use('/api/admin', adminDashboardRoutes(() => database));
//
// Vì dữ liệu MongoDB vẫn đang được bổ sung, API này:
//   - tự dò tên collection (orders / users / refunds...) — thiếu collection nào thì số liệu đó = 0
//   - chấp nhận nhiều tên field (total / totalAmount / totalPrice..., createdAt / orderDate...)
//   - tính toán bằng JavaScript cho dễ đọc (dữ liệu đồ án nhỏ nên không ảnh hưởng tốc độ)
// =====================================================================
const express = require('express');

const COLLECTIONS = {
  books: ['books'],
  categories: ['categories'],
  orders: ['orders', 'order'],
  users: ['users', 'accounts', 'customers'],
  refunds: ['refunds', 'returns', 'refund_requests', 'return_requests'],
};

// Trạng thái (đã bỏ dấu, viết thường, khoảng trắng -> _)
const CANCELLED = ['cancelled', 'canceled', 'failed', 'da_huy', 'huy', 'that_bai'];
const REFUND_PENDING = ['pending', 'requested', 'processing', 'reviewing', 'cho_xu_ly', 'dang_xu_ly', 'cho_duyet', 'cho_xac_nhan'];
const ORDER_RETURN_PENDING = ['return_requested', 'returning', 'refund_requested', 'cho_tra_hang', 'yeu_cau_tra_hang'];
const ADMIN_ROLES = ['admin', 'staff', 'manager', 'superadmin', 'quan_tri_vien'];

const LOW_STOCK_THRESHOLD = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ---------- Hàm phụ ----------
function normalize(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Ngày tạo của 1 document: createdAt / orderDate / date, nếu không có thì lấy từ _id */
function docDate(doc) {
  return toDate(doc.createdAt) || toDate(doc.orderDate) || toDate(doc.date) ||
    (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function orderItems(order) {
  return Array.isArray(order.items) ? order.items : Array.isArray(order.products) ? order.products : [];
}

function itemQty(item) {
  return toNumber(item.quantity ?? item.qty ?? 1) || 1;
}

/** Tổng tiền đơn: lấy field tổng nếu có, không thì cộng giá * số lượng từng sản phẩm */
function orderTotal(order) {
  for (const key of ['total', 'totalAmount', 'totalPrice', 'grandTotal', 'finalTotal', 'amount']) {
    if (order[key] !== undefined && order[key] !== null) return toNumber(order[key]);
  }
  return orderItems(order).reduce((sum, it) => sum + toNumber(it.price) * itemQty(it), 0);
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0; // kỳ trước = 0 thì không tính được %
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function idString(value) {
  return value === null || value === undefined ? '' : String(value);
}

// ---------- Tính toán (tách riêng để test được không cần server) ----------
async function buildDashboard(db, days, now = new Date()) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const pick = (key) => COLLECTIONS[key].find((name) => existing.has(name)) || null;
  const load = async (key) => {
    const name = pick(key);
    return name ? db.collection(name).find({}).toArray() : [];
  };

  const [books, categories, orders, users, refunds] = await Promise.all(
    ['books', 'categories', 'orders', 'users', 'refunds'].map(load),
  );

  // Khoảng thời gian: [start, end) = N ngày gần nhất (tính cả hôm nay), kỳ trước = N ngày liền trước
  const end = new Date(startOfDay(now).getTime() + DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  const prevStart = new Date(start.getTime() - days * DAY_MS);
  const inRange = (d, from, to) => d && d >= from && d < to;

  // ----- Đơn hàng -----
  const validOrders = orders.filter((o) => !CANCELLED.includes(normalize(o.status)));
  const current = validOrders.filter((o) => inRange(docDate(o), start, end));
  const previous = validOrders.filter((o) => inRange(docDate(o), prevStart, start));
  const revenue = current.reduce((s, o) => s + orderTotal(o), 0);
  const prevRevenue = previous.reduce((s, o) => s + orderTotal(o), 0);

  // ----- Khách hàng -----
  const customers = users.filter((u) => !ADMIN_ROLES.includes(normalize(u.role)));
  const newCustomers = customers.filter((u) => inRange(docDate(u), start, end)).length;
  const prevNewCustomers = customers.filter((u) => inRange(docDate(u), prevStart, start)).length;

  // ----- Yêu cầu trả hàng đang chờ -----
  const pendingReturns = refunds.length
    ? refunds.filter((r) => REFUND_PENDING.includes(normalize(r.status))).length
    : orders.filter((o) => ORDER_RETURN_PENDING.includes(normalize(o.status))).length;

  // ----- Biểu đồ doanh thu theo ngày -----
  const chart = [];
  const chartIndex = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const label = days <= 7 ? WEEKDAYS[d.getDay()] : `${d.getDate()}/${d.getMonth() + 1}`;
    chartIndex.set(dayKey(d), chart.length);
    chart.push({ date: dayKey(d), label, revenue: 0, orders: 0 });
  }
  for (const o of current) {
    const idx = chartIndex.get(dayKey(docDate(o)));
    if (idx === undefined) continue;
    chart[idx].revenue += orderTotal(o);
    chart[idx].orders += 1;
  }

  // ----- Danh mục hot: số cuốn bán ra theo thể loại trong kỳ -----
  const categoryName = new Map(categories.map((c) => [idString(c._id), c.name]));
  const bookById = new Map(books.map((b) => [idString(b._id), b]));
  const sold = new Map();
  for (const o of current) {
    for (const it of orderItems(o)) {
      const book = bookById.get(idString(it.bookId ?? it.book ?? it.productId ?? it._id));
      const catId = idString(it.categoryId ?? book?.categoryId);
      if (catId) sold.set(catId, (sold.get(catId) || 0) + itemQty(it));
    }
  }
  // Chưa có đơn nào có sản phẩm -> tạm tính theo số đầu sách đang bán của mỗi thể loại
  let categoryBasis = 'sold';
  if (sold.size === 0) {
    categoryBasis = 'books';
    for (const b of books) {
      if (normalize(b.status) !== 'active' || !b.categoryId) continue;
      const catId = idString(b.categoryId);
      sold.set(catId, (sold.get(catId) || 0) + 1);
    }
  }
  const totalSold = [...sold.values()].reduce((a, b) => a + b, 0);
  const ranked = [...sold.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 4).map(([id, value]) => ({ name: categoryName.get(id) || 'Chưa phân loại', value }));
  const others = ranked.slice(4).reduce((s, [, v]) => s + v, 0);
  if (others > 0) top.push({ name: 'Khác', value: others });
  const hotCategories = top.map((c) => ({ ...c, percent: totalSold ? Math.round((c.value / totalSold) * 100) : 0 }));

  // ----- Đơn hàng gần đây -----
  const userById = new Map(users.map((u) => [idString(u._id), u]));
  const recentOrders = [...orders]
    .sort((a, b) => (docDate(b)?.getTime() || 0) - (docDate(a)?.getTime() || 0))
    .slice(0, 5)
    .map((o) => {
      const user = userById.get(idString(o.userId ?? o.customerId ?? o.user));
      return {
        _id: idString(o._id),
        code: o.orderCode || o.code || '#' + idString(o._id).slice(-6).toUpperCase(),
        customerName: o.customerName || o.shippingAddress?.fullName || o.shipping?.fullName ||
          user?.fullName || user?.name || user?.username || user?.email || 'Khách vãng lai',
        createdAt: docDate(o),
        total: orderTotal(o),
        status: o.status || '',
      };
    });

  // ----- Tồn kho -----
  const activeBooks = books.filter((b) => normalize(b.status) === 'active');
  const lowStock = activeBooks
    .filter((b) => toNumber(b.stock) <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => toNumber(a.stock) - toNumber(b.stock));

  return {
    period: { days, from: start, to: end },
    stats: {
      revenue: { value: revenue, change: percentChange(revenue, prevRevenue) },
      orders: { value: current.length, change: percentChange(current.length, previous.length) },
      customers: { value: customers.length, new: newCustomers, change: percentChange(newCustomers, prevNewCustomers) },
      pendingReturns: { value: pendingReturns },
    },
    salesChart: chart,
    hotCategories,
    categoryBasis,
    recentOrders,
    inventory: {
      totalBooks: activeBooks.length,
      lowStockCount: lowStock.filter((b) => toNumber(b.stock) > 0).length,
      outOfStockCount: lowStock.filter((b) => toNumber(b.stock) <= 0).length,
      threshold: LOW_STOCK_THRESHOLD,
      lowStock: lowStock.slice(0, 5).map((b) => ({
        _id: idString(b._id), title: b.title, image: b.image || null, stock: toNumber(b.stock),
      })),
    },
    // Cho frontend biết collection nào đang có dữ liệu
    sources: { orders: pick('orders'), users: pick('users'), refunds: pick('refunds') },
  };
}

module.exports = function adminDashboardRoutes(getDb) {
  const router = express.Router();

  router.get('/dashboard', async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
      res.json(await buildDashboard(getDb(), days));
    } catch (error) {
      console.error('GET /api/admin/dashboard failed:', error.message);
      res.status(500).json({ message: 'Cannot build dashboard' });
    }
  });

  return router;
};

module.exports.buildDashboard = buildDashboard;
