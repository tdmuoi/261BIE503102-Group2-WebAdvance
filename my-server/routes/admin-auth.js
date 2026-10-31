const express = require("express");
const createAdminAuth = require("../middleware/admin-auth");

module.exports = function adminAuthRoutes(getDb, options) {
  const auth = createAdminAuth(getDb, options);
  const router = express.Router();
  router.use(auth.cors);
  router.post("/login", auth.login);
  router.get("/session", auth.requireAdmin, auth.current);
  router.post("/logout", auth.logout);
  return router;
};
