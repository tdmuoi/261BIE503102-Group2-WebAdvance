// =====================================================================
// Tạo ĐƠN HÀNG DEMO để thử trang Đơn hàng / Dashboard của admin khi web khách chưa có ai đặt hàng.
//
//   node scripts/seed-demo-orders.js           tạo 30 đơn demo (dùng sách + tài khoản có sẵn trong DB)
//   node scripts/seed-demo-orders.js 50        tạo 50 đơn demo
//   node scripts/seed-demo-orders.js --clear   xoá toàn bộ đơn demo (chỉ xoá đơn có isDemo: true)
//
// Đơn demo có mã LB-DEMO-xxxx và isDemo: true, KHÔNG trừ tồn kho sách.
// Lưu ý: DB dùng chung cả nhóm — báo nhóm trước khi chạy, xoá đơn demo trước khi nộp/quay video nếu cần.
// =====================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const NAMES = ['Nguyễn Thu Hà', 'Trần Minh Tâm', 'Lê Hoàng Yến', 'Phạm Gia Huy', 'Võ Ngọc Anh', 'Đặng Quốc Bảo', 'Bùi Khánh Linh', 'Hoàng Đức Minh'];
const DISTRICTS = [['Quận 1', 'Phường Bến Nghé'], ['Thủ Đức', 'Phường Linh Trung'], ['Quận 3', 'Phường Võ Thị Sáu'], ['Bình Thạnh', 'Phường 25']];
const STATUS_POOL = ['pending', 'pending', 'confirmed', 'shipping', 'delivered', 'delivered', 'delivered', 'cancelled', 'returned'];
const STEPS = ['pending', 'confirmed', 'shipping', 'delivered'];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const orders = db.collection('orders');

  if (process.argv.includes('--clear')) {
    const result = await orders.deleteMany({ isDemo: true });
    console.log(`Đã xoá ${result.deletedCount} đơn demo`);
    return client.close();
  }

  const count = Math.min(parseInt(process.argv[2], 10) || 30, 200);
  const books = await db.collection('books').find({ status: 'active', price: { $gt: 0 } }).limit(200).toArray();
  const users = (await db.collection('users').find({}).limit(50).toArray()).filter((u) => !['admin', 'staff'].includes(u.role));
  if (!books.length) throw new Error('Chưa có sách đang bán để tạo đơn');

  const existing = await orders.countDocuments({ isDemo: true });
  const docs = [];
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(Date.now() - Math.random() * 30 * 86400000);
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => {
      const b = pick(books);
      return { bookId: b._id, title: b.title, image: b.image ?? null, price: b.price, quantity: 1 + Math.floor(Math.random() * 2), format: 'print' };
    });
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const shippingFee = subtotal >= 300000 ? 0 : 25000;
    const user = users.length && Math.random() < 0.6 ? pick(users) : null;
    const name = user?.fullName || user?.name || pick(NAMES);
    const phone = user?.phone || '09' + String(Math.floor(10000000 + Math.random() * 89999999));
    const [district, ward] = pick(DISTRICTS);
    const status = pick(STATUS_POOL);
    const paymentMethod = pick(['cod', 'cod', 'bank_transfer', 'momo']);

    // Lịch sử trạng thái giả lập theo đúng luồng
    const history = [{ status: 'pending', at: createdAt, note: null }];
    const target = status === 'cancelled' ? 'pending' : status === 'returned' ? 'delivered' : status;
    let t = createdAt.getTime();
    for (const s of STEPS.slice(1, STEPS.indexOf(target) + 1)) {
      t += (2 + Math.random() * 20) * 3600000;
      history.push({ status: s, at: new Date(t), note: null });
    }
    if (status === 'cancelled') history.push({ status, at: new Date(t + 3600000), note: 'Khách đổi ý' });
    if (status === 'returned') history.push({ status, at: new Date(t + 86400000), note: 'Sách bị lỗi in' });

    docs.push({
      orderCode: `LB-DEMO-${String(existing + i + 1).padStart(4, '0')}`,
      userId: user?._id ?? null,
      customer: { name, email: user?.email ?? '', phone },
      shippingAddress: { fullName: name, phone, address: `${10 + i} Đường số ${1 + (i % 20)}`, ward, district, province: 'TP. Hồ Chí Minh' },
      items,
      subtotal,
      shippingFee,
      discount: 0,
      voucherCode: null,
      total: subtotal + shippingFee,
      paymentMethod,
      paymentStatus: paymentMethod !== 'cod' || ['delivered', 'returned'].includes(status) ? 'paid' : 'unpaid',
      status,
      statusHistory: history,
      note: Math.random() < 0.3 ? 'Giao giờ hành chính giúp mình' : '',
      adminNote: '',
      trackingCode: ['shipping', 'delivered', 'returned'].includes(status) ? 'GHN' + Math.floor(1e8 + Math.random() * 9e8) : '',
      stockDeducted: false,
      isDemo: true,
      createdAt,
      updatedAt: history[history.length - 1].at,
    });
  }

  await orders.insertMany(docs);
  console.log(`Đã tạo ${docs.length} đơn demo (mã LB-DEMO-...). Xoá bằng: node scripts/seed-demo-orders.js --clear`);
  await client.close();
}

main().catch((error) => {
  console.error('Lỗi:', error.message);
  process.exit(1);
});
