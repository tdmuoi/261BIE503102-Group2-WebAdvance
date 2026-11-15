'use strict';
const express = require('express');
const { ObjectId } = require('mongodb');
const { createHash } = require('node:crypto');
const { requireCustomer, toObjectId } = require('../middleware/customer-auth');
const { verifiedPaymentDate } = require('../middleware/admin-safe-status');
const demo = require('../middleware/demo-mode');
const text = value => typeof value === 'string' ? value.trim() : '';
const fail = (status,message) => Object.assign(new Error(message),{status});
const digest = value => createHash('sha256').update(value).digest('hex');
const returnView = row => ({_id:String(row._id),requestCode:row.requestCode,orderId:String(row.orderId),
  status:row.status,type:row.type,reason:row.reason,description:row.description,refundAmount:row.refundAmount ?? null,
  createdAt:row.createdAt,updatedAt:row.updatedAt});

module.exports = function customerRequests(getDb) {
  const router=express.Router(),auth=requireCustomer(getDb);
  router.post('/buyback-requests',auth,async(req,res,next)=>{
    try {
      const key=req.get('Idempotency-Key'),b=req.body || {};
      if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw fail(400,'Cần Idempotency-Key để gửi phiếu thu mua.');
      if(!Array.isArray(b.items)||!b.items.length||b.items.length>20)throw fail(400,'Phiếu cần từ 1 đến 20 đầu sách.');
      const items=b.items.map(item=>{
        const title=text(item?.title),author=text(item?.author),note=text(item?.note),quantity=item?.quantity,coverPrice=item?.coverPrice;
        if(!title||title.length>200||author.length>120||note.length>500||!Number.isSafeInteger(quantity)||quantity<1||quantity>20||
          !Number.isSafeInteger(coverPrice)||coverPrice<0||coverPrice>100000000)throw fail(400,'Thông tin sách thu mua không hợp lệ.');
        const condition={};
        for(const field of ['cover','spine','pages','extras']){
          const values=item?.condition?.[field];
          if(!Array.isArray(values)||!values.length||values.length>10||values.some(v=>typeof v!=='string'||!v.trim()||v.length>60))throw fail(400,'Cần mô tả tình trạng sách.');
          condition[field]=values.map(text);
        }
        const bookId=item.bookId==null?null:toObjectId(item.bookId);
        if(item.bookId!=null&&!bookId)throw fail(400,'ID sách không hợp lệ.');
        return {title,author,quantity,coverPrice,condition,note,bookId};
      });
      for(const item of items)if(item.bookId && !await getDb().collection('books').findOne({_id:item.bookId,isDemo:{$ne:true}}))
        throw fail(400,'Sách tham chiếu không tồn tại. Có thể gửi sách tự nhập không kèm bookId.');
      // Postal intake is the minimal existing workflow; no invented branch directory.
      if(b.delivery!=='post'||!['bank','voucher'].includes(b.payout))throw fail(400,'Hiện nhận phiếu gửi bưu điện; chọn hình thức nhận tiền/voucher.');
      const phone=text(b.customer?.phone),address=text(b.customer?.returnAddress),province=text(b.customer?.province);
      if(!/^0\d{9}$/.test(phone)||!address||address.length>500||!province||province.length>100)throw fail(400,'Thông tin liên hệ/địa chỉ hoàn sách không hợp lệ.');
      const images=b.images ?? [];
      if(!Array.isArray(images)||images.length>6||images.some(v=>typeof v!=='string'||v.length>500||!/^\/(?![\/\\])[^\\]*$|^https:\/\/[^\s@\\]+$/.test(v)))throw fail(400,'Ảnh cần là URL đã tải lên, tối đa 6 ảnh.');
      const canonical={items,phone,address,province,payout:b.payout,images};
      const _id=new ObjectId(digest('buyback:'+req.customer.userId+':'+key).slice(0,24)),requestHash=digest(JSON.stringify(canonical));
      const collection=getDb().collection('liquidation');
      const view=row=>({_id:String(row._id),requestCode:row.requestCode,status:row.status,createdAt:row.createdAt});
      const replay=row=>{if(String(row.userId)!==String(req.customer.userId)||row.requestHash!==requestHash)throw fail(409,'Khóa gửi phiếu đã dùng cho nội dung khác.');return row;};
      const existing=await collection.findOne({_id});
      if(existing)return res.json(view(replay(existing)));
      const now=new Date(),row={_id,requestCode:'BB-'+String(_id).toUpperCase(),userId:req.customer.userId,sellerId:req.customer.userId,
        customer:{name:req.customer.user.fullName || '',email:req.customer.email,phone},bookInfo:{items},books:items,
        title:items.map(i=>i.title).join(' • ').slice(0,500),quantity:items.reduce((n,i)=>n+i.quantity,0),condition:'Chờ kiểm tra thực tế',
        shipping:'postal',returnAddress:address,province,payout:b.payout,images,photosVerified:false,conditionVerified:false,
        offerPrice:null,status:'pending',requestHash,note:'',createdAt:now,updatedAt:now};
      try {await collection.insertOne(row);res.status(201).json(view(row));}
      catch(error){if(error.code!==11000)throw error;const saved=await collection.findOne({_id});if(!saved)throw error;res.json(view(replay(saved)));}
    }catch(error){next(error);}
  });
  router.post('/orders/:id/returns',auth,async(req,res,next)=>{
    try {
      const orderId=toObjectId(req.params.id),body=req.body || {};
      if(!orderId)throw fail(404,'Không tìm thấy đơn.');
      if(body.type!=='refund'||!['damaged','wrong_item','not_as_described','other'].includes(body.reason)||
        !text(body.description)||text(body.description).length>1000||Object.keys(body).some(k=>!['type','reason','description'].includes(k)))
        throw fail(400,'Hiện hỗ trợ trả toàn đơn và hoàn nội bộ; cần lý do và mô tả hợp lệ.');
      const order=await getDb().collection('orders').findOne({_id:orderId,userId:req.customer.userId,isDemo:{$ne:true}});
      if(!order)throw fail(404,'Không tìm thấy đơn.');
      const _id=new ObjectId(digest('return:'+req.customer.userId+':'+orderId).slice(0,24)),collection=getDb().collection('return_requests');
      const requestHash=digest(JSON.stringify([body.type,body.reason,text(body.description)]));
      const replay=row=>{if(row.requestHash!==requestHash)throw fail(409,'Đơn đã có yêu cầu đổi trả; xem lại yêu cầu cũ.');return row;};
      const existing=await collection.findOne({_id});
      if(existing)return res.json(returnView(replay(existing)));
      if(order.status!=='delivered'||(!verifiedPaymentDate(order)&&!demo.paymentDate(getDb(),order)))throw fail(409,'Đơn cần đã nhận và hoàn tất thanh toán hợp lệ.');
      const delivered=(order.statusHistory || []).find(h=>h.status==='delivered')?.at || order.updatedAt || order.createdAt;
      const deliveredAt=new Date(delivered),now=new Date();
      if(!Number.isFinite(+deliveredAt)||deliveredAt>now||now-deliveredAt>7*86400000)throw fail(409,'Thời hạn đổi trả là 7 ngày sau khi nhận.');
      if(!Array.isArray(order.items)||!order.items.length)throw fail(409,'Đơn không có chi tiết hợp lệ.');
      if(!Number.isSafeInteger(order.total)||order.total<=0||order.items.some(item=>!toObjectId(String(item.bookId))||!Number.isSafeInteger(item.quantity)||item.quantity<1))
        throw fail(409,'Số tiền hoặc chi tiết đơn cần được đối soát trước khi đổi trả.');
      const row={_id,requestCode:'RR-'+String(_id).toUpperCase(),orderId,userId:req.customer.userId,orderCode:order.orderCode,
        customer:order.customer,items:order.items,type:body.type,reason:body.reason,description:text(body.description),status:'pending',
        refundPolicy:'full-order-total-v1',refundableTotal:order.total,
        restocked:false,requestHash,statusHistory:[{status:'pending',at:now,note:null}],createdAt:now,updatedAt:now};
      try{await collection.insertOne(row);res.status(201).json(returnView(row));}
      catch(error){if(error.code!==11000)throw error;const saved=await collection.findOne({_id});if(!saved)throw error;res.json(returnView(replay(saved)));}
    }catch(error){next(error);}
  });
  router.get('/account/returns',auth,async(req,res,next)=>{
    try {res.json((await getDb().collection('return_requests').find({userId:req.customer.userId}).sort({createdAt:-1}).limit(100).toArray()).map(returnView));}
    catch(error){next(error);}
  });
  return router;
};
