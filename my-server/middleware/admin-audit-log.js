'use strict';
const { ObjectId } = require('mongodb');
// Record successful admin mutations and authenticated login/logout. No bodies, cookies,
// credentials, OTP codes or query strings are copied to the audit collection.
module.exports = function adminAuditLog(getDb) {
  return (req, res, next) => {
    res.once('finish', () => {
      if (!req.admin?._id || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
          res.statusCode < 200 || res.statusCode >= 300) return;
      const path = req.originalUrl.split('?')[0].slice(0, 500);
      const authAction = /^\/api\/admin\/auth\/login\/?$/i.test(path) ? 'auth.login'
        : /^\/api\/admin\/auth\/logout\/?$/i.test(path) ? 'auth.logout' : null;
      if (/^\/api\/admin\/auth(?:\/|$)/i.test(path) && !authAction) return;
      const segments = path.split('/').filter(Boolean);
      const target = segments.findLast(value => /^[a-f\d]{24}$/i.test(value));
      Promise.resolve().then(() => getDb().collection('audit_logs').insertOne({
        actorId: ObjectId.isValid(req.admin._id) ? new ObjectId(req.admin._id) : null,
        action: authAction || req.method, targetType: segments[2] || 'admin', targetId: target ? new ObjectId(target) : null,
        details: { roleCode: req.admin.roleCode, path, statusCode: res.statusCode },
        source: 'admin_http', createdAt: new Date(),
      })).catch(error => console.error('Không ghi được audit log:', error.message));
    });
    next();
  };
};

// Call only from the successful listen callback: this is an actual lifecycle
// event, never a seed record or a fabricated administrator action.
module.exports.recordServerStart = function recordServerStart(db, port) {
  return db.collection('audit_logs').insertOne({
    actorId: null, action: 'server.started', targetType: 'system', targetId: null,
    details: { database: db.databaseName, port }, source: 'backend_lifecycle', createdAt: new Date(),
  });
};
