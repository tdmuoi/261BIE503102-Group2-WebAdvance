'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
const dns = require('node:dns');
const servers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean);
if (servers.length) dns.setServers(servers);
const { MongoClient } = require('mongodb');
const cleanup = require('../middleware/ebook-pdf-cleanup');
async function main() {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME), plan = await cleanup.inspect(db);
    console.log(JSON.stringify({ checked: plan.books.length, readable: plan.readable.length,
      missing: plan.missing.map(b => ({ id: String(b._id), title: b.title })),
      removed: process.argv.includes('--apply') ? await cleanup.apply(db, plan) : [] }));
  } finally { await client.close(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
