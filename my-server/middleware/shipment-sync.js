'use strict';
// Orders remain the source of truth. One shipment per physical order, using the
// same MongoDB transaction as the order change. No carrier API or invented tracking.
function shipmentDocument(order) {
  if (!order || order.isDemo === true || !order.userId || !order.shippingAddress ||
      !(order.items || []).some(i => i.format !== 'ebook')) return null;
  const date = value => value && Number.isFinite(+new Date(value)) ? new Date(value) : null;
  const historyDate = status => date((order.statusHistory || []).find(h => h.status === status)?.at);
  return { orderId: order._id, orderCode: order.orderCode, userId: order.userId,
      // The existing partial unique index covers strings, including ''. A missing
      // code must be null so multiple unshipped orders can coexist.
      status: order.status, trackingCode: typeof order.trackingCode === 'string' && order.trackingCode.trim() ? order.trackingCode.trim() : null,
      carrier: order.carrier || '', shippedAt: historyDate('shipping'), deliveredAt: historyDate('delivered'),
      shippingAddress: order.shippingAddress, shippingMethod: order.shippingMethod || 'standard',
      shippingFee: order.shippingFee ?? 0, paymentMode: order.paymentMode || 'live',
      updatedAt: date(order.updatedAt) || new Date(), createdAt: date(order.createdAt) || new Date() };
}
module.exports = async function syncShipment(db, order, session) {
  const document = shipmentDocument(order);
  if (!document) return;
  const { createdAt, ...fields } = document;
  await db.collection('shipments').updateOne({ _id: order._id }, {
    $set: fields,
    $setOnInsert: { createdAt },
  }, { upsert: true, session });
};
module.exports.document = shipmentDocument;
