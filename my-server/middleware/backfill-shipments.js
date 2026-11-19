'use strict';
const transaction = require('./admin-transaction');
const { document: shipmentDocument } = require('./shipment-sync');

module.exports = async function backfillShipments(db) {
  return transaction(db, async session => {
    const summary = { eligible: 0, inserted: 0, existing: 0 };
    const shipments = db.collection('shipments');
    const orders = db.collection('orders').find({ isDemo: { $ne: true }, userId: { $ne: null },
      shippingAddress: { $type: 'object' } }, { session });
    for await (const order of orders) {
      const document = shipmentDocument(order);
      if (!document) continue;
      summary.eligible++;
      const existing = await shipments.findOne({ $or: [{ _id: order._id }, { orderId: order._id }] }, { session });
      if (existing) { summary.existing++; continue; }
      const result = await shipments.updateOne({ _id: order._id }, { $setOnInsert: document }, { session, upsert: true });
      summary.inserted += result.upsertedCount || 0;
    }
    return summary;
  });
};
