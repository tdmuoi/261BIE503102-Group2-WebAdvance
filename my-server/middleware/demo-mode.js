'use strict';
function enabled(db) {
  const options = db?.client?.options;
  return process.env.DEMO_PAYMENTS_ENABLED === 'true' && process.env.NODE_ENV !== 'production' &&
    /^lightbooks_(?:demo|qa|business_qa|phase\d_qa)_/.test(db?.databaseName || '') &&
    !options?.srvHost && Array.isArray(options?.hosts) && options.hosts.length > 0 &&
    options.hosts.every(host => ['127.0.0.1', 'localhost', '::1'].includes(host.host));
}
function requireDemo(db) {
  if (!enabled(db)) throw Object.assign(new Error('Thanh toán QR Demo chỉ bật trên database QA/demo local riêng.'), { status:403 });
}
function paymentDate(db, order, now = new Date()) {
  const demo = order?.demoPayment, at = new Date(demo?.confirmedAt), paidAt = new Date(order?.paidAt);
  return enabled(db) && order?.paymentMode === 'demo' && order.paymentMethod === 'qr_demo' &&
    order.paymentStatus === 'paid' && demo?.status === 'succeeded' && demo.reference === 'DEMO-' + String(order._id).toUpperCase() &&
    Number.isFinite(+at) && at <= now && +paidAt === +at ? at : null;
}
module.exports = { enabled, requireDemo, paymentDate };
