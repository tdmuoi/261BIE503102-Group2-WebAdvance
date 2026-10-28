// =====================================================================
// Tạo YÊU CẦU ĐỔI TRẢ DEMO để thử trang Đổi trả & hoàn tiền của admin.
// Lấy từ các đơn demo đã giao (chạy scripts/seed-demo-orders.js trước).
//
//   node scripts/seed-demo-returns.js          tạo tối đa 12 yêu cầu demo
//   node scripts/seed-demo-returns.js --clear  xoá toàn bộ yêu cầu demo (isDemo: true)
//
// Yêu cầu demo có mã RR-DEMO-xxxx, không đổi tồn kho, không sửa đơn hàng.
// =====================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const REASONS = [
  ['damaged', 'Bìa sách bị rách, gáy bị móp khi nhận hàng'],
  ['wrong_item', 'Đặt Mắt biếc nhưng nhận được sách khác'],
  ['not_as_described', 'Sách là bản bìa mềm, trên web ghi bìa cứng'],
  ['missing', 'Đơn 2 cuốn nhưng chỉ nhận 1 cuốn'],
  ['changed_mind', 'Mua trùng sách đã có'],
];
const STATUS_POOL = ['pending', 'pending', 'pending', 'approved', 'received', 'refunded', 'exchanged', 'rejected'];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const returns = db.collection('return_requests');

  if (process.argv.includes('--clear')) {
    const result = await returns.deleteMany({ isDemo: true });
    console.log(`Đã xoá ${result.deletedCount} yêu cầu demo`);
    return client.close();
  }

  const orders = await db.collection('orders').find({ isDemo: true, status: { $in: ['delivered', 'returned'] } }).limit(12).toArray();
  if (!orders.length) throw new Error('Chưa có đơn demo đã giao. Chạy: node scripts/seed-demo-orders.js');

  const existing = await returns.countDocuments({ isDemo: true });
  const docs = orders.map((order, i) => {
    const [reason, description] = pick(REASONS);
    const status = STATUS_POOL[i % STATUS_POOL.length];
    const type = status === 'exchanged' || (reason === 'wrong_item' && status !== 'refunded') ? 'exchange' : 'refund';
    const item = order.items[0];
    const createdAt = new Date(new Date(order.updatedAt ?? order.createdAt).getTime() + 86400000);
    const flow = ['pending', 'approved', 'received', status].filter((s, k, arr) => arr.indexOf(s) === k);
    const steps = status === 'rejected' ? ['pending', 'rejected'] : flow.slice(0, flow.indexOf(status) + 1);
    const history = steps.map((s, k) => ({
      status: s,
      at: new Date(createdAt.getTime() + k * 20 * 3600000),
      note: s === 'rejected' ? 'Quá 7 ngày kể từ khi nhận hàng' : null,
    }));
    return {
      requestCode: `RR-DEMO-${String(existing + i + 1).padStart(4, '0')}`,
      orderId: order._id,
      orderCode: order.orderCode,
      userId: order.userId ?? null,
      customer: order.customer,
      items: [{ bookId: item.bookId, title: item.title, image: item.image ?? null, price: item.price, quantity: 1 }],
      type,
      reason,
      description,
      images: [],
      refundMethod: order.paymentMethod === 'cod' ? 'bank_transfer' : 'original',
      bankInfo: order.paymentMethod === 'cod' ? { bankName: 'Vietcombank', accountName: order.customer?.name ?? '', accountNumber: '0071000' + (100000 + i) } : null,
      refundAmount: status === 'refunded' ? item.price : null,
      status,
      statusHistory: history,
      adminNote: '',
      isDemo: true,
      createdAt,
      updatedAt: history[history.length - 1].at,
    };
  });

  await returns.insertMany(docs);
  console.log(`Đã tạo ${docs.length} yêu cầu đổi trả demo (mã RR-DEMO-...). Xoá bằng: node scripts/seed-demo-returns.js --clear`);
  await client.close();
}

main().catch((error) => {
  console.error('Lỗi:', error.message);
  process.exit(1);
});
