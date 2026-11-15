'use strict';
const express = require('express');
const { createHash } = require('node:crypto');
const { ObjectId } = require('mongodb');
const { requireCustomer, toObjectId } = require('../middleware/customer-auth');
const transaction = require('../middleware/admin-transaction');
const demoMode = require('../middleware/demo-mode');
const revisions = require('../middleware/admin-revision');
const { adjustStock, releaseVoucher } = require('../middleware/admin-safe-status');
const { orderView } = require('./customer-orders');
const failure = (status,message) => Object.assign(new Error(message),{status});

async function settle(db, userId, id, outcome = 'succeeded') {
  demoMode.requireDemo(db);
  if (!['succeeded','failed','cancelled','expired'].includes(outcome)) throw failure(400,'Kết quả thanh toán Demo không hợp lệ.');
  const orderId = toObjectId(String(id));
  if (!orderId) throw failure(404,'Không tìm thấy đơn hàng.');
  try { return await transaction(db, async session => {
    const orders = db.collection('orders');
    const current = await orders.findOne({_id:orderId,userId}, {session});
    if (!current) throw failure(404,'Không tìm thấy đơn hàng.');
    if (current.isDemo === true || current.paymentMode !== 'demo' || current.paymentMethod !== 'qr_demo')
      throw failure(409,'Đơn không sử dụng QR Demo.');
    if (current.demoPayment?.status !== 'pending') {
      if (current.demoPayment?.status === outcome || (current.demoPayment?.status === 'expired' && outcome === 'cancelled')) return current;
      throw failure(409,'Thanh toán Demo đã kết thúc; tải lại đơn hàng.');
    }
    if (current.status !== 'pending' || current.paymentStatus !== 'unpaid') throw failure(409,'Đơn không còn chờ thanh toán.');
    if (!Number.isSafeInteger(current.total) || current.total < 0) throw failure(409,'Số tiền đơn hàng không hợp lệ.');
    const now = new Date(), expires = new Date(current.demoPayment.expiresAt);
    if (!Number.isFinite(+expires)) throw failure(409,'Thời hạn thanh toán không hợp lệ.');
    const result = now >= expires ? 'expired' : outcome;
    if (result === 'expired' && now < expires) throw failure(409,'Đơn chưa hết hạn thanh toán.');
    const reference = 'DEMO-' + String(orderId).toUpperCase();
    const payment = { _id:orderId, orderId, userId, paymentMethod:'qr_demo', amount:current.total,
      status:result === 'succeeded' ? 'paid' : result, reference, source:'demo_confirmation', isDemo:true,
      confirmedAt:now, createdAt:now };
    // Built-in unique _id serializes retries. All ledger/order/grant writes commit together.
    await db.collection('payments').insertOne(payment,{session});
    const set = { demoPayment:{...current.demoPayment,status:result,reference,amount:current.total,confirmedAt:now}, updatedAt:now };
    if (result === 'succeeded') {
      set.paymentStatus = 'paid'; set.paidAt = now;
      set.paymentVerification = {source:'demo',verifiedAt:now};
      for (const item of (current.items || []).filter(line => line.format === 'ebook')) {
        const bookId = toObjectId(String(item.bookId));
        if (!bookId) throw failure(409,'Tham chiếu Ebook không hợp lệ.');
        const existing = await db.collection('personalBooks').findOne({userId,bookId},{session});
        // Never overwrite an existing free/real license with a simulated purchase.
        if (!existing) {
          const _id = new ObjectId(createHash('sha256').update('demo-ebook:'+userId+':'+bookId).digest('hex').slice(0,24));
          await db.collection('personalBooks').insertOne({_id,userId,bookId,orderId,orderCode:current.orderCode,
            acquisitionType:'demo',paymentMode:'demo',demoPaymentReference:reference,readingStatus:'unread',page:1,
            progressPercent:0,createdAt:now,updatedAt:now},{session});
        } else if (existing.acquisitionType === 'demo') {
          const updated = await db.collection('personalBooks').updateOne({_id:existing._id,userId,bookId,...revisions.snapshot(existing)},
            {$set:{orderId,orderCode:current.orderCode,demoPaymentReference:reference,accessRevokedAt:null,accessRevokedOrderId:null,
              updatedAt:revisions.nextUpdatedAt(existing)},
              ...(existing.accessRevokedAt ? {$push:{demoRevocationHistory:{orderId:existing.accessRevokedOrderId,at:existing.accessRevokedAt}}} : {})},{session});
          if(updated.modifiedCount!==1)throw failure(409,'Quyền Ebook vừa thay đổi; vui lòng thử lại.');
        }
      }
    } else {
      if (current.stockDeducted === true && !current.restocked) await adjustStock(db,session,current.items,1);
      await releaseVoucher(db,session,current);
      Object.assign(set,{status:'cancelled',restocked:current.restocked === true || current.stockDeducted === true,
        ...(current.voucherCode ? {voucherReleased:true} : {})});
    }
    const changed = await orders.updateOne({_id:orderId,userId,status:'pending',paymentStatus:'unpaid'},
      {$set:set,...(result === 'succeeded' ? {} : {$push:{statusHistory:{status:'cancelled',at:now,note:'QR Demo: '+result}}})},{session});
    if (changed.modifiedCount !== 1) throw failure(409,'Đơn vừa thay đổi; tải lại trước khi thử lại.');
    return {...current,...set};
  }); } catch (error) {
    if (error.code !== 11000) throw error;
    const committed = await db.collection('orders').findOne({_id:orderId,userId});
    if (committed?.paymentMode === 'demo' && committed.demoPayment?.status === outcome) return committed;
    throw error;
  }
}
module.exports = function customerDemoPaymentRoutes(getDb) {
  const router = express.Router(), auth = requireCustomer(getDb);
  router.post('/orders/:id/demo-payment',auth,async(req,res,next)=>{
    try {
      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key=>key!=='outcome'))
        throw failure(400,'Chỉ gửi outcome; số tiền được đọc từ đơn hàng trên server.');
      const order = await settle(getDb(),req.customer.userId,req.params.id,body.outcome ?? 'succeeded');
      res.json(orderView(order));
    } catch(error) {next(error);}
  });
  return router;
};
module.exports.settle = settle;
