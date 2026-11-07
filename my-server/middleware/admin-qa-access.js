"use strict";
// Uses the SAME authentication instance as index.js. Never trusts client roles.
module.exports = function adminQaAccess(auth) {
  const modules = {
    books: "products",
    orders: "orders",
    returns: "orders",
    dashboard: "dashboard",
    banners: "banners",
  };
  return (req, res, next) => {
    const pathname = req.path.toLowerCase().replace(/\/+$/, '');
    const resource = pathname.split("/")[1];
    const module = modules[resource];
    if (!module) return next();
    return auth.requireAdmin(req, res, () => {
      let action = ["GET", "HEAD"].includes(req.method)
        ? "view"
        : req.method === "POST"
          ? "create"
          : req.method === "DELETE"
            ? "delete"
            : "update";
      if (resource === "orders" && pathname.endsWith("/status"))
        action =
          req.body?.status === "cancelled"
            ? "cancel"
            : req.body?.status === "returned"
              ? "refund"
              : "confirm";
      if (resource === "orders" && req.body?.paymentStatus !== undefined)
        action = req.body.paymentStatus === "refunded" ? "refund" : "confirm";
      if (resource === "returns" && !["GET", "HEAD"].includes(req.method))
        action = pathname.endsWith("/status")
          ? req.body?.status === "refunded"
            ? "refund"
            : req.body?.status === "rejected"
              ? "cancel"
              : "confirm"
          : "update";
      if (
        resource === "books" &&
        pathname === "/books/bulk" &&
        req.body?.action === "delete"
      )
        action = "delete";
      return auth.requirePermission(module, action)(req, res, next);
    });
  };
};
