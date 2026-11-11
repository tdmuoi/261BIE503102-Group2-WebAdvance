// =====================================================================
// API cho web khách hàng (my-app). Gắn vào index.js MỘT lần:
//   const customerRoutes = require('./routes/customer');
//   app.use('/api', customerRoutes(() => database));
// Chi tiết từng nhóm API xem đầu các file customer-*.js
// =====================================================================
const express = require('express');
const customerAuthRoutes = require('./customer-auth');
const customerAccountRoutes = require('./customer-account');
const customerOrderRoutes = require('./customer-orders');
const customerWishlistRoutes = require('./customer-wishlist');

module.exports = function customerRoutes(getDb) {
  const router = express.Router();
  router.use(customerAuthRoutes(getDb));
  router.use(customerAccountRoutes(getDb));
  router.use(customerOrderRoutes(getDb));
  router.use(customerWishlistRoutes(getDb));

  // Lỗi trong các route khách hàng: trả JSON thay vì trang lỗi HTML
  router.use((error, req, res, next) => {
    console.error(`${req.method} ${req.originalUrl} failed:`, error.message);
    if (res.headersSent) return next(error);
    res.status(500).json({ message: 'Có lỗi xảy ra, vui lòng thử lại' });
  });
  return router;
};
