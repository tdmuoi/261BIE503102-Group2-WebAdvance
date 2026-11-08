const { createHash } = require('node:crypto');
const actions = {
  dashboard: ['view'], products: ['view', 'create', 'update', 'delete'],
  inventory: ['view', 'adjust_inventory'], orders: ['view', 'update', 'confirm', 'cancel', 'refund', 'export'],
  customers: ['view', 'update', 'export', 'block'], accounts: ['view', 'update'],
  vouchers: ['view', 'create', 'update'], content: ['view', 'create', 'update', 'publish'],
  banners: ['view', 'create', 'update', 'delete'], liquidation: ['view', 'approve', 'reject'],
  settings: ['view', 'update'], categories: ['view', 'create', 'update', 'delete'],
};
const revision = (role) => createHash('sha256').update(JSON.stringify([String(role._id), role.code, role.permissions])).digest('hex');
const shape = (permissions) => Array.isArray(permissions) && permissions.every((entry) =>
  entry && typeof entry.module === 'string' && Array.isArray(entry.actions) && entry.actions.every((action) => typeof action === 'string'));
function validate(permissions) {
  if (!Array.isArray(permissions) || permissions.length > Object.keys(actions).length) return false;
  const modules = new Set();
  return permissions.every((entry) => {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some((key) => !['module', 'actions'].includes(key)) ||
        typeof entry.module !== 'string' || !Object.hasOwn(actions, entry.module) || modules.has(entry.module) ||
        !Array.isArray(entry.actions) || new Set(entry.actions).size !== entry.actions.length ||
        !entry.actions.every((action) => actions[entry.module].includes(action))) return false;
    modules.add(entry.module); return true;
  });
}
module.exports = { actions, revision, validate, shape };
