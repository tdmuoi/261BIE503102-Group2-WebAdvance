'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
const dns = require('node:dns');
const servers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean);
if (servers.length) dns.setServers(servers);
const { MongoClient } = require('mongodb');

async function reconcile(db) {
  const otp = await require('../middleware/prepare-data-flows')(db);
  const shipments = await require('../middleware/backfill-shipments')(db);
  return { ...otp, shipments };
}
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Chỉ chạy khi cần đồng bộ dữ liệu: node scripts/reconcile-data-flows.js --apply');
  if (!process.env.MONGODB_URI || !process.env.DB_NAME) throw new Error('Missing MongoDB configuration');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    console.log(JSON.stringify({ database: process.env.DB_NAME, ...await reconcile(client.db(process.env.DB_NAME)) }));
  } finally { await client.close(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = reconcile;
