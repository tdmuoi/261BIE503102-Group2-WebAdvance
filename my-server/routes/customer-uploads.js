'use strict';
// =====================================================================
// GET /api/uploads/signature?purpose=avatar|buyback|review   (cần đăng nhập)
// =====================================================================
const express = require('express');
const { requireCustomer } = require('../middleware/customer-auth');
const cloudinary = require('../middleware/cloudinary');

module.exports = function customerUploads(getDb) {
  const router = express.Router();
  const auth = requireCustomer(getDb);

  router.get('/uploads/signature', auth, (req, res) => {
    const purpose = String(req.query.purpose || '');
    if (!Object.hasOwn(cloudinary.PURPOSES, purpose)) return res.status(400).json({ message: 'Loại ảnh tải lên không hợp lệ' });
    const params = cloudinary.uploadParams(purpose, req.customer.userId);
    if (!params) {
      console.error('GET /api/uploads/signature failed: missing CLOUDINARY_* environment variables');
      return res.status(503).json({ message: 'Chức năng tải ảnh chưa được cấu hình, bạn thử lại sau nhé.' });
    }
    res.set('Cache-Control', 'no-store').json(params);
  });

  return router;
};
