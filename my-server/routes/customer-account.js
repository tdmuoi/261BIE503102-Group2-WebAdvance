// =====================================================================
// Khu vực Tài khoản của web khách hàng — mọi route bắt buộc đăng nhập, chỉ đọc/ghi dữ liệu của chính người đó
//   GET/PUT  /api/account/profile          PUT/DELETE /api/account/avatar   PUT /api/account/password
//   GET/POST /api/account/addresses        PUT/DELETE /api/account/addresses/:id   PUT /api/account/addresses/:id/default
//   GET /api/account/notifications?type=&page=   PUT /api/account/notifications/:id/read   PUT /api/account/notifications/read-all
//   GET /api/account/ebooks   GET/PUT /api/account/ebooks/:bookId/progress
//   GET /api/account/reviews  POST /api/reviews   GET /api/books/:bookId/reviews (công khai)
//   GET /api/account/buybacks
// Collections: users, accounts, addresses, notifications, personalBooks, reviews, liquidation, orders
// =====================================================================
const express = require('express');
const { hashPassword, verifyPassword, requireCustomer, toObjectId } = require('../middleware/customer-auth');
const { publicUser } = require('./customer-auth');

const PHONE_PATTERN = /^0\d{9}$/;
const NOTIFICATION_PAGE = 6;
const ADDRESS_TYPES = { home: 'Nhà riêng', office: 'Văn phòng', school: 'Trường học' };
const MAX_AVATAR_CHARS = 90000; // ảnh đã thu nhỏ ở trình duyệt (data URL), vừa giới hạn 100kb của express.json()
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const iso = (d) => (d ? new Date(d).toISOString() : null);

function tierOf(spent) {
  if (spent >= 5000000) return 'Thành viên Vàng';
  if (spent >= 1000000) return 'Thành viên Bạc';
  return 'Thành viên Đồng';
}

function addressView(a) {
  const type = a.type || Object.keys(ADDRESS_TYPES).find((k) => ADDRESS_TYPES[k] === a.label) || 'home';
  return {
    _id: String(a._id),
    fullName: a.recipientName || a.fullName || '',
    phone: a.phone || '',
    province: a.province || '',
    ward: a.ward || '',
    street: a.street || a.addressLine || '',
    type,
    isDefault: !!a.isDefault,
  };
}

function notificationView(n) {
  return {
    _id: String(n._id),
    type: n.type || 'order',
    icon: n.icon || 'box',
    title: n.title || '',
    message: n.message || n.content || '',
    createdAt: iso(n.createdAt),
    read: !!(n.read ?? n.isRead),
    action: n.action || null,
  };
}

module.exports = function customerAccountRoutes(getDb) {
  const router = express.Router();
  const db = () => getDb();
  const auth = requireCustomer(getDb);

  // ---------------- Hồ sơ ----------------
  async function profileOf(req) {
    const { account, user, email } = req.customer;
    const delivered = await db().collection('orders')
      .find({ $or: [{ userId: user._id }, { 'customer.email': email }], status: 'delivered' }, { projection: { total: 1 } })
      .toArray();
    const spent = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
    return {
      _id: String(user._id),
      fullName: user.fullName || '',
      username: user.username || email.split('@')[0],
      email,
      emailVerified: !!account.emailVerified,
      phone: user.phone || null,
      birthday: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().slice(0, 10) : null,
      gender: ['female', 'male', 'other'].includes(user.gender) ? user.gender : null,
      avatar: user.avatar || null,
      tier: tierOf(spent),
      memberId: String(user._id).slice(-7).toUpperCase(),
      passwordChangedAt: iso(account.passwordChangedAt),
      twoFactorEnabled: !!user.twoFactorEnabled,
    };
  }

  router.get('/account/profile', auth, async (req, res, next) => {
    try {
      res.json(await profileOf(req));
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/profile', auth, async (req, res, next) => {
    try {
      const fullName = text(req.body?.fullName);
      const phone = text(req.body?.phone) || null;
      const birthday = text(req.body?.birthday) || null;
      const gender = ['female', 'male', 'other'].includes(req.body?.gender) ? req.body.gender : null;
      if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ message: 'Họ tên cần từ 2 đến 80 ký tự' });
      if (phone && !PHONE_PATTERN.test(phone)) return res.status(400).json({ message: 'Số điện thoại không hợp lệ', field: 'phone' });
      if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || new Date(birthday) > new Date())) {
        return res.status(400).json({ message: 'Ngày sinh không hợp lệ', field: 'birthday' });
      }
      if (phone && (await db().collection('users').findOne({ phone, _id: { $ne: req.customer.userId } }))) {
        return res.status(409).json({ message: 'Số điện thoại đã được tài khoản khác sử dụng', field: 'phone' });
      }
      const set = { fullName, phone, gender, dateOfBirth: birthday ? new Date(birthday) : null, twoFactorEnabled: req.body?.twoFactorEnabled === true, updatedAt: new Date() };
      await db().collection('users').updateOne({ _id: req.customer.userId }, { $set: set });
      Object.assign(req.customer.user, set);
      res.json(await profileOf(req));
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/avatar', auth, async (req, res, next) => {
    try {
      const avatar = text(req.body?.avatar);
      if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > MAX_AVATAR_CHARS) {
        return res.status(400).json({ message: 'Ảnh đại diện không hợp lệ hoặc quá lớn' });
      }
      await db().collection('users').updateOne({ _id: req.customer.userId }, { $set: { avatar, updatedAt: new Date() } });
      res.json({ avatar, user: publicUser(req.customer.account, { ...req.customer.user, avatar }) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/account/avatar', auth, async (req, res, next) => {
    try {
      await db().collection('users').updateOne({ _id: req.customer.userId }, { $set: { avatar: null, updatedAt: new Date() } });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/password', auth, async (req, res, next) => {
    try {
      const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const next_ = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!(await verifyPassword(current, req.customer.account.passwordHash))) {
        return res.status(400).json({ message: 'Mật khẩu hiện tại chưa đúng', field: 'currentPassword' });
      }
      if (next_.length < 8 || !/[A-Za-z]/.test(next_) || !/\d/.test(next_) || Buffer.byteLength(next_) > 72) {
        return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 8 ký tự, có cả chữ và số', field: 'newPassword' });
      }
      const passwordChangedAt = new Date();
      await db().collection('accounts').updateOne(
        { _id: req.customer.accountId },
        { $set: { passwordHash: await hashPassword(next_), passwordChangedAt, updatedAt: passwordChangedAt } },
      );
      res.json({ passwordChangedAt: passwordChangedAt.toISOString() });
    } catch (error) {
      next(error);
    }
  });

  // ---------------- Sổ địa chỉ ----------------
  const addresses = () => db().collection('addresses');
  async function listAddresses(userId) {
    const list = await addresses().find({ userId }).sort({ isDefault: -1, createdAt: 1 }).toArray();
    return list.map(addressView);
  }
  function addressBody(body) {
    const fullName = text(body?.fullName);
    const phone = text(body?.phone);
    const province = text(body?.province);
    const ward = text(body?.ward);
    const street = text(body?.street);
    const type = ADDRESS_TYPES[body?.type] ? body.type : 'home';
    if (fullName.length < 2 || !PHONE_PATTERN.test(phone) || !province || !ward || street.length < 3) return null;
    return {
      recipientName: fullName, phone, province, ward, street, type, label: ADDRESS_TYPES[type],
      addressLine: `${street}, ${ward}, ${province}`, isDefault: body?.isDefault === true,
    };
  }
  async function makeDefault(userId, id) {
    await addresses().updateMany({ userId, _id: { $ne: id } }, { $set: { isDefault: false } });
    await addresses().updateOne({ userId, _id: id }, { $set: { isDefault: true } });
  }

  router.get('/account/addresses', auth, async (req, res, next) => {
    try {
      res.json(await listAddresses(req.customer.userId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/account/addresses', auth, async (req, res, next) => {
    try {
      const body = addressBody(req.body);
      if (!body) return res.status(400).json({ message: 'Vui lòng nhập đủ họ tên, số điện thoại và địa chỉ' });
      const userId = req.customer.userId;
      const count = await addresses().countDocuments({ userId });
      if (count >= 10) return res.status(400).json({ message: 'Sổ địa chỉ tối đa 10 địa chỉ' });
      const now = new Date();
      const { insertedId } = await addresses().insertOne({ ...body, userId, isDefault: false, createdAt: now, updatedAt: now });
      if (body.isDefault || count === 0) await makeDefault(userId, insertedId);
      res.status(201).json(await listAddresses(userId));
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/addresses/:id', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const body = addressBody(req.body);
      if (!id || !body) return res.status(400).json({ message: 'Vui lòng nhập đủ họ tên, số điện thoại và địa chỉ' });
      const userId = req.customer.userId;
      const { isDefault, ...rest } = body;
      const result = await addresses().updateOne({ _id: id, userId }, { $set: { ...rest, updatedAt: new Date() } });
      if (!result.matchedCount) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
      if (isDefault) await makeDefault(userId, id);
      res.json(await listAddresses(userId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/account/addresses/:id', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const userId = req.customer.userId;
      const removed = id ? await addresses().findOneAndDelete({ _id: id, userId }) : null;
      if (!removed) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
      if (removed.isDefault) {
        const first = await addresses().findOne({ userId }, { sort: { createdAt: 1 } });
        if (first) await makeDefault(userId, first._id);
      }
      res.json(await listAddresses(userId));
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/addresses/:id/default', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const userId = req.customer.userId;
      if (!id || !(await addresses().findOne({ _id: id, userId }))) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
      await makeDefault(userId, id);
      res.json(await listAddresses(userId));
    } catch (error) {
      next(error);
    }
  });

  // ---------------- Thông báo ----------------
  const notifications = () => db().collection('notifications');

  router.get('/account/notifications', auth, async (req, res, next) => {
    try {
      const userId = req.customer.userId;
      const type = ['order', 'promo', 'buyback', 'bookshelf'].includes(req.query.type) ? req.query.type : null;
      const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 50);
      const filter = type ? { userId, type } : { userId };
      const [list, total, unread] = await Promise.all([
        notifications().find(filter).sort({ createdAt: -1 }).limit(page * NOTIFICATION_PAGE).toArray(),
        notifications().countDocuments(filter),
        notifications().countDocuments({ userId, read: { $ne: true }, isRead: { $ne: true } }),
      ]);
      res.json({ items: list.map(notificationView), total, unread, hasMore: total > list.length });
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/notifications/read-all', auth, async (req, res, next) => {
    try {
      await notifications().updateMany({ userId: req.customer.userId }, { $set: { read: true, isRead: true } });
      res.json({ unread: 0 });
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/notifications/:id/read', auth, async (req, res, next) => {
    try {
      const id = toObjectId(req.params.id);
      const doc = id
        ? await notifications().findOneAndUpdate({ _id: id, userId: req.customer.userId }, { $set: { read: true, isRead: true } }, { returnDocument: 'after' })
        : null;
      if (!doc) return res.status(404).json({ message: 'Không tìm thấy thông báo' });
      res.json(notificationView(doc));
    } catch (error) {
      next(error);
    }
  });

  // ---------------- Tủ sách ebook ----------------
  const personal = () => db().collection('personalBooks');

  router.get('/account/ebooks', auth, async (req, res, next) => {
    try {
      const rows = await personal().find({ userId: req.customer.userId }).sort({ purchasedAt: -1 }).toArray();
      const books = await db().collection('books').find({ _id: { $in: rows.map((r) => r.bookId) } }).toArray();
      const authorIds = books.map((b) => b.authorId).filter(Boolean);
      const authors = await db().collection('authors').find({ _id: { $in: authorIds } }, { projection: { name: 1 } }).toArray();
      const authorName = new Map(authors.map((a) => [String(a._id), a.name]));
      const byId = new Map(books.map((b) => [String(b._id), b]));
      res.json(
        rows.map((r) => {
          const b = byId.get(String(r.bookId)) || {};
          const totalPages = r.totalPages || b.pages || 140;
          const page = r.page || 0;
          return {
            bookId: String(r.bookId),
            title: b.title || r.title || 'Sách điện tử',
            author: (b.authorId && authorName.get(String(b.authorId))) || (b.authorNames || []).join(', ') || '',
            image: b.image || r.image || '',
            format: 'EPUB',
            progress: Math.min(100, Math.round((page / totalPages) * 100)),
            page,
            totalPages,
            lastReadAt: iso(r.lastReadAt),
            purchasedAt: iso(r.purchasedAt || r.createdAt),
            sizes: { EPUB: Math.max(1, Math.round(totalPages / 70) / 2), PDF: Math.max(2, Math.round(totalPages / 20) / 2) },
          };
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/account/ebooks/:bookId/progress', auth, async (req, res, next) => {
    try {
      const bookId = toObjectId(req.params.bookId);
      const row = bookId ? await personal().findOne({ userId: req.customer.userId, bookId }) : null;
      if (!row) return res.status(404).json({ message: 'Ebook không có trong tủ sách của bạn' });
      res.json({ page: row.page || 1, bookmarks: row.bookmarks || [], notes: row.notes || [], highlights: row.highlights || [], lastReadAt: iso(row.lastReadAt) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/account/ebooks/:bookId/progress', auth, async (req, res, next) => {
    try {
      const bookId = toObjectId(req.params.bookId);
      const b = req.body || {};
      const page = Math.max(1, parseInt(b.page, 10) || 1);
      const clean = (list, max) => (Array.isArray(list) ? list.slice(0, max) : []);
      const set = {
        page,
        totalPages: Math.max(page, parseInt(b.totalPages, 10) || page),
        bookmarks: clean(b.bookmarks, 200).filter((n) => Number.isInteger(n)),
        notes: clean(b.notes, 200).map((n) => ({ id: text(n?.id).slice(0, 40), page: parseInt(n?.page, 10) || 1, quote: text(n?.quote).slice(0, 500), text: text(n?.text).slice(0, 300) })),
        highlights: clean(b.highlights, 300).map((h) => ({ page: parseInt(h?.page, 10) || 1, text: text(h?.text).slice(0, 500) })),
        lastReadAt: new Date(),
      };
      const result = bookId ? await personal().updateOne({ userId: req.customer.userId, bookId }, { $set: set }) : { matchedCount: 0 };
      if (!result.matchedCount) return res.status(404).json({ message: 'Ebook không có trong tủ sách của bạn' });
      res.json({ ok: true, lastReadAt: set.lastReadAt.toISOString() });
    } catch (error) {
      next(error);
    }
  });

  // ---------------- Đánh giá ----------------
  router.get('/account/reviews', auth, async (req, res, next) => {
    try {
      const list = await db().collection('reviews').find({ userId: req.customer.userId }, { projection: { bookId: 1, rating: 1 } }).toArray();
      res.json(Object.fromEntries(list.map((r) => [String(r.bookId), r.rating || 0])));
    } catch (error) {
      next(error);
    }
  });

  router.post('/reviews', auth, async (req, res, next) => {
    try {
      const bookId = toObjectId(req.body?.bookId);
      const rating = parseInt(req.body?.rating, 10);
      if (!bookId || !(rating >= 1 && rating <= 5)) return res.status(400).json({ message: 'Vui lòng chọn số sao từ 1 đến 5' });
      const userId = req.customer.userId;
      const bought = await db().collection('orders').findOne({
        $or: [{ userId }, { 'customer.email': req.customer.email }], status: { $nin: ['cancelled'] }, 'items.bookId': { $in: [bookId, String(bookId)] },
      });
      if (!bought) return res.status(403).json({ message: 'Bạn chỉ đánh giá được sách đã mua' });
      const now = new Date();
      const anonymous = req.body?.anonymous === true;
      await db().collection('reviews').updateOne(
        { userId, bookId },
        {
          $set: {
            rating, tags: (Array.isArray(req.body?.tags) ? req.body.tags : []).map(text).filter(Boolean).slice(0, 8),
            content: text(req.body?.content).slice(0, 500), anonymous,
            userName: anonymous ? 'Độc giả ẩn danh' : req.customer.user.fullName || 'Độc giả', verifiedPurchase: true, updatedAt: now,
          },
          $setOnInsert: { reviewCode: `RV-${Date.now().toString(36).toUpperCase()}`, helpfulCount: 0, createdAt: now },
        },
        { upsert: true },
      );
      res.status(201).json({ bookId: String(bookId), rating });
    } catch (error) {
      next(error);
    }
  });

  /** Công khai — trang chi tiết sách có thể dùng (BookService.getReviews) */
  router.get('/books/:bookId/reviews', async (req, res, next) => {
    try {
      const bookId = toObjectId(req.params.bookId);
      if (!bookId) return res.json([]);
      const list = await db().collection('reviews').find({ bookId: { $in: [bookId, String(bookId)] } }).sort({ createdAt: -1 }).limit(50).toArray();
      res.json(
        list.map((r) => ({
          _id: String(r._id),
          userName: r.userName || r.customerName || 'Độc giả',
          rating: r.rating || r.stars || 5,
          content: r.content || '',
          createdAt: iso(r.createdAt),
          verifiedPurchase: r.verifiedPurchase !== false,
          helpfulCount: r.helpfulCount || r.helpful || 0,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  // ---------------- Yêu cầu thanh lý (tab "Thanh lý" ở Đơn hàng) ----------------
  router.get('/account/buybacks', auth, async (req, res, next) => {
    try {
      const { userId, email } = req.customer;
      const list = await db().collection('liquidation')
        .find({ $or: [{ userId }, { 'customer.email': email }, { email }, { customerEmail: email }] })
        .sort({ createdAt: -1 }).limit(50).toArray();
      res.json(
        list.map((r) => ({
          code: r.requestCode || String(r._id).slice(-6).toUpperCase(),
          createdAt: iso(r.createdAt),
          bookCount: Array.isArray(r.books) ? r.books.length : r.quantity || 1,
          status: r.status === 'completed' ? 'completed' : r.offeredPrice || r.quote ? 'quoted' : 'reviewing',
          quote: r.offeredPrice ?? r.quote ?? null,
          note: r.note || '',
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
};
