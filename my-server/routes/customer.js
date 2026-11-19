// =====================================================================
// API cho web khách hàng (my-app). Gắn vào index.js MỘT lần:
// =====================================================================
const express = require('express');
const customerAuthRoutes = require('./customer-auth');
const customerAccountRoutes = require('./customer-account');
const customerOrderRoutes = require('./customer-orders');
const customerWishlistRoutes = require('./customer-wishlist');

module.exports = function customerRoutes(getDb) {
  const router = express.Router();
  router.use(require('./admin-settings').publicRoutes(getDb));
  router.use(require('./customer-cart')(getDb));
  router.use(require('./event-registrations')(getDb));
  router.use(customerAuthRoutes(getDb));
  router.use(customerAccountRoutes(getDb));
  router.use(customerOrderRoutes(getDb));
  router.use(require('./customer-demo-payment')(getDb));
  router.use(require('./customer-momo-payment')(getDb));
  router.use(require('./customer-requests')(getDb));
  router.use(require('./customer-uploads')(getDb));
  router.use(require('./customer-follows')(getDb));
  router.use(customerWishlistRoutes(getDb));

  router.use((error, req, res, next) => {
    console.error(`${req.method} ${req.originalUrl} failed:`, error.message);
    if (res.headersSent) return next(error);
    const status = [400, 403, 404, 409, 503].includes(error.status) ? error.status : 500;
    const message = status === 500 ? 'Có lỗi xảy ra, vui lòng thử lại'
      : status === 403 ? 'Bạn không có quyền thực hiện thao tác này.' : error.message;
    res.status(status).json({ message });
  });
  return router;
};

module.exports.publicBook = function publicBook(book) {
  if (book.bookType !== 'ebook' || book.price === 0) return book;
  const {
    fileUrl, pdfUrl, previewUrl, htmlUrl, sourceUrl, pdfSourcePage,
    ebookFileId, ebookMetadata, ...catalog
  } = book;
  return catalog;
};
