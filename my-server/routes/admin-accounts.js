const express = require("express");
const { ObjectId } = require("mongodb");
const createAdminAuth = require("../middleware/admin-auth");
const text = (value) => (typeof value === "string" ? value.trim() : "");
const id = (value) => (value == null ? "" : String(value));
const asDate = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : null;
const asNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const PUBLIC_ACCOUNT = {
  email: 1,
  roleCode: 1,
  status: 1,
  provider: 1,
  lastLogin: 1,
  createdAt: 1,
};
const PUBLIC_PROFILE = {
  accountId: 1,
  fullName: 1,
  username: 1,
  avatar: 1,
  phone: 1,
  dateOfBirth: 1,
  createdAt: 1,
};
const MODULE_LABELS = {
  accounts: "Tài khoản quản trị",
  dashboard: "Tổng quan",
  customers: "Khách hàng",
  products: "Sách",
  inventory: "Tồn kho",
  orders: "Đơn hàng",
  content: "Nội dung",
  liquidation: "Thanh lý",
  settings: "Cài đặt",
  banners: "Banner",
  categories: "Thể loại",
};
const ADMIN_CODES = [
  "SUPER_ADMIN",
  "WAREHOUSE_MANAGER",
  "SALES_MANAGER",
  "CONTENT_MANAGER",
];
const STATUSES = [
  { value: "active", label: "Hoạt động", tone: "ok" },
  { value: "locked", label: "Bị khóa", tone: "bad", locked: true },
  { value: "inactive", label: "Ngừng hoạt động", tone: "mute" },
];
function fail(status, message, errors) {
  const error = new Error(message);
  Object.assign(error, { status, errors });
  return error;
}
function respondError(res, error) {
  return res.status(error.status || (error.code === 11000 ? 409 : 503)).json({
    message: error.status
      ? error.message
      : error.code === 11000
        ? "Email đã tồn tại."
        : "Không đọc hoặc lưu được dữ liệu tài khoản.",
    ...(error.errors ? { errors: error.errors } : {}),
  });
}
function queryOf(query) {
  const page = query.page === undefined ? 1 : Number(query.page),
    limit = query.limit === undefined ? 7 : Number(query.limit);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw fail(400, "Phân trang không hợp lệ.");
  for (const key of ["q", "tier", "status", "roleId"])
    if (
      query[key] !== undefined &&
      (typeof query[key] !== "string" || query[key].length > 160)
    )
      throw fail(400, "Bộ lọc không hợp lệ.");
  return {
    page,
    limit,
    q: text(query.q).toLocaleLowerCase("vi"),
    tier: text(query.tier),
    status: text(query.status),
    roleId: text(query.roleId),
  };
}
function paginate(items, query) {
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(items.length / query.limit)),
  );
  return {
    items: items.slice((page - 1) * query.limit, page * query.limit),
    total: items.length,
    page,
    limit: query.limit,
  };
}
function matchId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value))
    throw fail(400, "ID không hợp lệ.");
  return new ObjectId(value);
}
const variants = (value) => ({ $in: [value, id(value)] });
const totalOf = (order) => asNumber(order.total);
const paid = (order) =>
  !["cancelled", "canceled", "returned", "refunded"].includes(order.status) &&
  order.paymentStatus !== "refunded" &&
  (order.paymentStatus === "paid" ||
    ["delivered", "completed"].includes(order.status));
function orderView(order) {
  return {
    _id: id(order._id),
    code: text(order.orderCode) || id(order._id),
    total: totalOf(order),
    status: text(order.status),
    createdAt: asDate(order.createdAt),
    isDemo: order.isDemo === true,
    items: (Array.isArray(order.items) ? order.items : []).map((item) => ({
      title: text(item.title) || "Chưa có tên sách",
      image: text(item.image),
      quantity: asNumber(item.quantity) || 0,
      format: text(item.format) || null,
    })),
  };
}

module.exports = function adminAccountsRoutes(getDb, options) {
  const router = express.Router(),
    auth = createAdminAuth(getDb, options);
  router.use(auth.cors, auth.requireAdmin);
  router.use((req, res, next) =>
    auth.requirePermission(
      req.path.startsWith("/customers") ? "customers" : "accounts",
      ["GET", "HEAD"].includes(req.method) ? "view" : "update",
    )(req, res, next),
  );
  async function sources() {
    const db = getDb();
    if (!db) throw fail(503, "Cơ sở dữ liệu không khả dụng.");
    const names = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (item) => item.name,
      ),
    );
    if (!["accounts", "users", "roles"].every((name) => names.has(name)))
      throw fail(
        503,
        "Schema đã xác minh yêu cầu accounts, users và roles. Không tự tạo collection.",
      );
    return { db, names };
  }
  async function directory(source) {
    const [accounts, profiles, roles] = await Promise.all([
      source.db
        .collection("accounts")
        .find({})
        .project(PUBLIC_ACCOUNT)
        .sort({ createdAt: -1, _id: -1 })
        .toArray(),
      source.db.collection("users").find({}).project(PUBLIC_PROFILE).toArray(),
      source.db
        .collection("roles")
        .find({})
        .project({
          code: 1,
          name: 1,
          description: 1,
          isSystem: 1,
          permissions: 1,
        })
        .toArray(),
    ]);
    return {
      accounts,
      profiles,
      roles,
      profileByAccount: new Map(
        profiles.map((profile) => [id(profile.accountId), profile]),
      ),
    };
  }
  async function ordersFor(source, userId) {
    if (!source.names.has("orders")) return null;
    return source.db
      .collection("orders")
      .find(userId ? { userId: variants(userId) } : {})
      .project({
        userId: 1,
        orderCode: 1,
        total: 1,
        status: 1,
        paymentStatus: 1,
        createdAt: 1,
        items: 1,
        isDemo: 1,
      })
      .sort({ createdAt: -1 })
      .toArray();
  }
  function customerView(account, profile, orders) {
    const own = orders?.filter((order) => id(order.userId) === id(profile._id));
    const amounts = own?.filter(paid).map(totalOf);
    return {
      _id: id(profile._id),
      accountId: id(account._id),
      fullName:
        text(profile.fullName) || text(profile.username) || "Chưa có tên",
      email: text(account.email),
      phone: text(profile.phone) || null,
      tier: null,
      points: null,
      status: account.status,
      createdAt: asDate(profile.createdAt),
      orderCount: own ? own.length : null,
      totalSpent:
        amounts && amounts.every((value) => value !== null)
          ? amounts.reduce((sum, value) => sum + value, 0)
          : null,
    };
  }
  function selectCustomers(data, orders) {
    return data.accounts
      .filter((account) => account.roleCode === "CUSTOMER")
      .flatMap((account) => {
        const profile = data.profileByAccount.get(id(account._id));
        return profile ? [customerView(account, profile, orders)] : [];
      });
  }
  function filterCustomers(items, query) {
    return items.filter(
      (item) =>
        (!query.q ||
          `${item.fullName} ${item.email} ${item.phone || ""}`
            .toLocaleLowerCase("vi")
            .includes(query.q)) &&
        (!query.status || item.status === query.status) &&
        (!query.tier || item.tier === query.tier),
    );
  }
  function roleData(data) {
    const roles = data.roles.filter((role) => ADMIN_CODES.includes(role.code));
    const modules = [
      ...new Set(
        roles.flatMap((role) =>
          Array.isArray(role.permissions)
            ? role.permissions.map((entry) => entry.module)
            : [],
        ),
      ),
    ];
    return {
      roles: roles.map((role) => ({
        _id: id(role._id),
        code: role.code,
        name: role.name,
        label: role.name,
        editable: false,
        permissionsKnown: Array.isArray(role.permissions),
      })),
      permissions: modules.map((_id) => ({
        _id,
        label: MODULE_LABELS[_id] || _id,
      })),
      grants: {},
      moduleActions: Object.fromEntries(
        roles.map((role) => [
          id(role._id),
          Object.fromEntries(
            (role.permissions || []).map((entry) => [
              entry.module,
              entry.actions,
            ]),
          ),
        ]),
      ),
    };
  }
  function superOnly(req) {
    if (req.admin.roleCode !== "SUPER_ADMIN")
      throw fail(403, "Chỉ SUPER_ADMIN được thay đổi tài khoản.");
  }
  async function related(source, name, filter, fields) {
    if (!source.names.has(name)) return null;
    return source.db
      .collection(name)
      .find(filter)
      .project(fields)
      .sort({ createdAt: -1 })
      .toArray();
  }
  const history = (docs, codeKey, amountKey) => ({
    available: docs !== null,
    items: (docs || []).map((entry) => ({
      _id: id(entry._id),
      code: text(entry[codeKey]) || id(entry._id),
      status: text(entry.status),
      amount: amountKey ? asNumber(entry[amountKey]) : null,
      createdAt: asDate(entry.createdAt),
      rating: asNumber(entry.rating),
      isDemo: entry.isDemo === true,
    })),
  });
  async function customerList(req) {
    const source = await sources(),
      query = queryOf(req.query),
      data = await directory(source),
      orders = await ordersFor(source);
    const items = selectCustomers(data, orders);
    const shifted = new Date(Date.now() + 7 * 3600000),
      start =
        Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) -
        7 * 3600000;
    const previous =
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - 1, 1) -
      7 * 3600000;
    const customers = data.accounts.filter(
      (account) => account.roleCode === "CUSTOMER",
    );
    const current = customers.filter(
      (account) =>
        asDate(account.createdAt) &&
        new Date(account.createdAt).getTime() >= start,
    ).length;
    const prev = customers.filter(
      (account) =>
        asDate(account.createdAt) &&
        new Date(account.createdAt).getTime() >= previous &&
        new Date(account.createdAt).getTime() < start,
    ).length;
    const activeKnown = customers.some((account) => asDate(account.lastLogin));
    const unlinked = (orders || []).filter(
      (order) => order.userId == null,
    ).length;
    return {
      ...paginate(filterCustomers(items, query), query),
      stats: {
        newCustomers: current,
        customerChangePercent: prev
          ? Math.round(((current - prev) / prev) * 1000) / 10
          : null,
        activeAccounts: activeKnown
          ? customers.filter(
              (account) =>
                asDate(account.lastLogin) &&
                Date.parse(account.lastLogin) >= Date.now() - 30 * 86400000,
            ).length
          : null,
        activeChangePercent: null,
        goldMembers: null,
        lockedAccounts: customers.filter(
          (account) => account.status === "locked",
        ).length,
      },
      tiers: [],
      statuses: STATUSES,
      capabilities: {
        sendEmail: false,
        resetPassword: false,
        lock: req.admin.roleCode === "SUPER_ADMIN",
      },
      customerTotal: items.length,
      adminTotal: data.accounts.filter((account) =>
        ADMIN_CODES.includes(account.roleCode),
      ).length,
      dataNote: `Đọc accounts + users.accountId. Chưa có trường hạng/điểm; ${unlinked} đơn chưa gắn userId không được tự gán vào khách hàng.`,
    };
  }
  router.get("/customers/export", async (req, res) => {
    try {
      const source = await sources(),
        data = await directory(source),
        orders = await ordersFor(source),
        items = filterCustomers(
          selectCustomers(data, orders),
          queryOf(req.query),
        );
      const cell = (value) =>
        '"' +
        String(value ?? "")
          .replace(/^[\s]*[=+@-]|^[\t\r]/, (match) => "'" + match)
          .replace(/"/g, '""') +
        '"';
      const rows = [
        [
          "Tên",
          "Email",
          "Số điện thoại",
          "Đơn đã liên kết",
          "Chi tiêu đã liên kết",
          "Trạng thái",
        ],
        ...items.map((item) => [
          item.fullName,
          item.email,
          item.phone,
          item.orderCount,
          item.totalSpent,
          item.status,
        ]),
      ];
      res
        .set("Content-Disposition", 'attachment; filename="khach-hang.csv"')
        .type("text/csv")
        .send(
          "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
        );
    } catch (error) {
      respondError(res, error);
    }
  });
  router.get("/customers", async (req, res) => {
    try {
      res.json(await customerList(req));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.get("/customers/:id", async (req, res) => {
    try {
      const source = await sources(),
        profileId = matchId(req.params.id);
      const profile = await source.db
        .collection("users")
        .findOne({ _id: profileId }, { projection: PUBLIC_PROFILE });
      const account =
        profile &&
        (await source.db
          .collection("accounts")
          .findOne(
            { _id: profile.accountId, roleCode: "CUSTOMER" },
            { projection: PUBLIC_ACCOUNT },
          ));
      if (!profile || !account)
        throw fail(404, "Không tìm thấy hồ sơ khách hàng.");
      const orders = await ordersFor(source, profile._id),
        view = customerView(account, profile, orders),
        completed = orders?.filter(paid);
      const [addresses, returns, buybacks, reviews] = await Promise.all([
        related(
          source,
          "addresses",
          { userId: variants(profile._id) },
          { addressLine: 1, isDefault: 1 },
        ),
        related(
          source,
          "return_requests",
          {
            $or: [
              { userId: variants(profile._id) },
              {
                orderId: {
                  $in: (orders || []).flatMap((order) => [
                    order._id,
                    id(order._id),
                  ]),
                },
              },
            ],
          },
          {
            requestCode: 1,
            status: 1,
            refundAmount: 1,
            createdAt: 1,
            isDemo: 1,
          },
        ),
        related(
          source,
          "liquidation",
          { sellerId: variants(profile._id) },
          { requestCode: 1, status: 1, offerPrice: 1, createdAt: 1, isDemo: 1 },
        ),
        related(
          source,
          "reviews",
          { userId: variants(profile._id) },
          { reviewCode: 1, status: 1, rating: 1, createdAt: 1, isDemo: 1 },
        ),
      ]);
      const itemsKnown =
        completed &&
        completed.every(
          (order) =>
            Array.isArray(order.items) &&
            order.items.every(
              (item) =>
                Number.isSafeInteger(item.quantity) && item.quantity > 0,
            ),
        );
      res.json({
        ...view,
        orders: (orders || []).map(orderView),
        ordersAvailable: orders !== null,
        address:
          (addresses?.find((address) => address.isDefault) || addresses?.[0])
            ?.addressLine || null,
        birthday: asDate(profile.dateOfBirth),
        customerCode: id(profile._id),
        vip: false,
        internalNote: null,
        behavior: null,
        metrics: {
          averageOrderValue:
            completed?.length && view.totalSpent !== null
              ? Math.round(view.totalSpent / completed.length)
              : null,
          repurchaseRate: null,
          booksPurchased: itemsKnown
            ? completed
                .flatMap((order) => order.items)
                .reduce((sum, item) => sum + item.quantity, 0)
            : null,
          lastPurchaseAt: asDate(completed?.[0]?.createdAt),
        },
        returns: history(returns, "requestCode", "refundAmount"),
        buybacks: history(buybacks, "requestCode", "offerPrice"),
        reviews: history(reviews, "reviewCode", null),
        capabilities: {
          sendEmail: false,
          resetPassword: false,
          lock: req.admin.roleCode === "SUPER_ADMIN",
        },
        dataNote:
          "Chỉ đếm lịch sử có userId/sellerId hoặc orderId liên kết; không gán dữ liệu khách vãng lai theo tên/email.",
      });
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post("/customers/:id/actions", async (req, res) => {
    try {
      superOnly(req);
      const action = req.body?.action;
      if (!["send-email", "reset-password", "lock", "unlock"].includes(action))
        throw fail(400, "Thao tác không hợp lệ.");
      if (["send-email", "reset-password"].includes(action))
        throw fail(501, "Chưa có cơ chế gửi email/đặt lại mật khẩu an toàn.");
      const source = await sources(),
        profile = await source.db
          .collection("users")
          .findOne(
            { _id: matchId(req.params.id) },
            { projection: { accountId: 1 } },
          );
      const account =
        profile &&
        (await source.db
          .collection("accounts")
          .findOne(
            { _id: profile.accountId, roleCode: "CUSTOMER" },
            { projection: PUBLIC_ACCOUNT },
          ));
      if (!account) throw fail(404, "Không tìm thấy tài khoản khách hàng.");
      if (!["active", "locked"].includes(account.status))
        throw fail(409, "Trạng thái hiện tại không hỗ trợ thao tác này.");
      const result = await source.db.collection("accounts").updateOne(
        { _id: account._id, roleCode: "CUSTOMER", status: account.status },
        {
          $set: {
            status: action === "lock" ? "locked" : "active",
            updatedAt: new Date(),
          },
        },
      );
      if (!result.matchedCount) throw fail(409, "Tài khoản đã thay đổi.");
      res.json({
        message:
          "Đã cập nhật trạng thái accounts. Quy trình đăng nhập khách hàng cần thực thi trạng thái này.",
      });
    } catch (error) {
      respondError(res, error);
    }
  });
  router.get("/admins", async (req, res) => {
    try {
      const source = await sources(),
        data = await directory(source),
        query = queryOf(req.query),
        roles = roleData(data);
      const items = data.accounts
        .filter((account) => ADMIN_CODES.includes(account.roleCode))
        .map((account) => {
          const profile = data.profileByAccount.get(id(account._id)),
            role = data.roles.find((role) => role.code === account.roleCode);
          return {
            _id: id(account._id),
            profileId: profile ? id(profile._id) : null,
            fullName: text(profile?.fullName) || "Chưa có tên",
            email: account.email,
            roleId: role ? id(role._id) : "",
            roleName: role?.name || account.roleCode,
            status: account.status,
            emailVerified: null,
            twoFactorEnabled: null,
            lastLoginAt: asDate(account.lastLogin),
            createdAt: asDate(account.createdAt),
            isSelf: id(account._id) === req.admin._id,
            protected: account.roleCode === "SUPER_ADMIN",
          };
        });
      const filtered = items.filter(
        (item) =>
          (!query.q ||
            `${item.fullName} ${item.email}`
              .toLocaleLowerCase("vi")
              .includes(query.q)) &&
          (!query.status || item.status === query.status) &&
          (!query.roleId || item.roleId === query.roleId),
      );
      res.json({
        ...paginate(filtered, query),
        statuses: STATUSES,
        roles,
        activity: [],
        security: {
          requireTwoFactor: null,
          forcePasswordRotation: null,
          restrictOfficeIp: null,
          idleTimeoutMinutes: null,
          canUpdate: false,
        },
        capabilities: {
          invite: false,
          edit: req.admin.roleCode === "SUPER_ADMIN",
          remove: false,
          roles: false,
        },
        customerTotal: data.accounts.filter(
          (account) => account.roleCode === "CUSTOMER",
        ).length,
        adminTotal: items.length,
        dataNote:
          "Đọc accounts.roleCode → roles.code. permissions là module/actions; ma trận hiển thị quyền thật, không quy đổi mọi quyền ghi thành toàn quyền. audit_logs hiện chưa có bản ghi.",
      });
    } catch (error) {
      respondError(res, error);
    }
  });
  function validateAdmin(body, partial = false) {
    const errors = {};
    if (!partial || Object.hasOwn(body, "fullName"))
      if (!text(body.fullName) || text(body.fullName).length > 100)
        errors.fullName = "Họ tên từ 1 đến 100 ký tự.";
    if (!partial || Object.hasOwn(body, "email"))
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(body.email)) ||
        text(body.email).length > 254
      )
        errors.email = "Email không hợp lệ.";
    if (!partial || Object.hasOwn(body, "roleId"))
      if (!text(body.roleId)) errors.roleId = "Chọn vai trò.";
    if (
      body.status !== undefined &&
      !["active", "locked", "inactive"].includes(body.status)
    )
      errors.status = "Trạng thái không hợp lệ.";
    if (
      Object.keys(body).some(
        (key) => !["fullName", "email", "roleId", "status"].includes(key),
      )
    )
      errors.body = "Có trường không được phép sửa.";
    if (Object.keys(errors).length)
      throw fail(400, "Thông tin chưa hợp lệ.", errors);
  }
  router.post("/admins", async (req, res) => {
    try {
      superOnly(req);
      validateAdmin(req.body || {});
      throw fail(
        501,
        "Chưa có quy trình mời và đặt mật khẩu an toàn. Không tự tạo accounts/users.",
      );
    } catch (error) {
      respondError(res, error);
    }
  });
  router.patch("/admins/:id", async (req, res) => {
    let session;
    try {
      superOnly(req);
      const body = req.body || {};
      validateAdmin(body, true);
      if (!Object.keys(body).length) throw fail(400, "Chưa có thay đổi.");
      const source = await sources(),
        accountId = matchId(req.params.id),
        data = await directory(source),
        account = data.accounts.find(
          (item) =>
            id(item._id) === id(accountId) &&
            ADMIN_CODES.includes(item.roleCode),
        );
      if (!account) throw fail(404, "Không tìm thấy Admin.");
      const role = data.roles.find((role) => role.code === account.roleCode),
        profile = data.profileByAccount.get(id(account._id));
      if (body.roleId !== undefined && body.roleId !== id(role?._id))
        throw fail(
          409,
          "Không tự thay đổi vai trò hoặc nâng/hạ quyền qua chức năng này.",
        );
      if (
        body.status !== undefined &&
        body.status !== account.status &&
        (account.roleCode === "SUPER_ADMIN" ||
          id(account._id) === req.admin._id)
      )
        throw fail(409, "Không đổi trạng thái bản thân hoặc SUPER_ADMIN.");
      const email =
        body.email === undefined ? undefined : text(body.email).toLowerCase();
      if (
        email &&
        data.accounts.some(
          (other) =>
            id(other._id) !== id(account._id) &&
            text(other.email).toLowerCase() === email,
        )
      )
        throw fail(409, "Email đã tồn tại.");
      if (body.fullName !== undefined && !profile)
        throw fail(409, "Chưa có hồ sơ users liên kết với Admin.");
      if (!source.db.client?.startSession)
        throw fail(
          501,
          "Cần MongoDB transaction để cập nhật đồng bộ accounts và users.",
        );
      session = source.db.client.startSession();
      await session.withTransaction(async () => {
        const result = await source.db.collection("accounts").updateOne(
          {
            _id: account._id,
            roleCode: account.roleCode,
            status: account.status,
          },
          {
            $set: {
              ...(email === undefined ? {} : { email }),
              ...(body.status === undefined ? {} : { status: body.status }),
              updatedAt: new Date(),
            },
          },
          { session },
        );
        if (!result.matchedCount) throw fail(409, "Tài khoản đã thay đổi.");
        if (body.fullName !== undefined) {
          const result = await source.db.collection("users").updateOne(
            { _id: profile._id, accountId: account._id },
            {
              $set: { fullName: text(body.fullName), updatedAt: new Date() },
            },
            { session },
          );
          if (!result.matchedCount) throw fail(409, "Hồ sơ đã thay đổi.");
        }
      });
      res.json({
        _id: id(account._id),
        fullName:
          body.fullName === undefined ? profile?.fullName : text(body.fullName),
        email: email ?? account.email,
        roleId: id(role._id),
        roleName: role.name,
        status: body.status ?? account.status,
        emailVerified: null,
        twoFactorEnabled: null,
        isSelf: id(account._id) === req.admin._id,
        protected: account.roleCode === "SUPER_ADMIN",
        lastLoginAt: asDate(account.lastLogin),
        createdAt: asDate(account.createdAt),
      });
    } catch (error) {
      respondError(res, error);
    } finally {
      await session?.endSession();
    }
  });
  router.delete("/admins/:id", async (req, res) => {
    try {
      superOnly(req);
      const source = await sources(),
        account = await source.db
          .collection("accounts")
          .findOne(
            { _id: matchId(req.params.id) },
            { projection: PUBLIC_ACCOUNT },
          );
      if (!account) throw fail(404, "Không tìm thấy Admin.");
      throw fail(
        account.roleCode === "SUPER_ADMIN" ? 409 : 501,
        account.roleCode === "SUPER_ADMIN"
          ? "Không xóa SUPER_ADMIN, bao gồm quản trị viên cuối cùng."
          : "Không thực hiện xóa tài khoản.",
      );
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post("/roles", (req, res) =>
    res.status(501).json({
      message:
        "Vai trò hiện tại là isSystem và permissions dạng module/actions. Chưa được phép tạo hoặc thay schema quyền.",
    }),
  );
  router.put("/roles/:id/permissions", (req, res) =>
    res.status(501).json({
      message:
        "Không ghi permissionIds lên schema permissions hiện có. Cần nhóm duyệt quy trình chỉnh quyền chi tiết.",
    }),
  );
  router.patch("/security", (req, res) =>
    res.status(501).json({
      message:
        "Chưa có cơ chế thực thi thay đổi bảo mật. Không lưu cài đặt giả.",
    }),
  );
  return router;
};
