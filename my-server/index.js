
require('dotenv').config();

const dns = require('node:dns');
const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map((server) => server.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');
const createAdminAuth = require('./middleware/admin-auth');
const adminAuthRoutes = require('./routes/admin-auth');
const adminVouchersRoutes = require('./routes/admin-vouchers');
const adminAccountsRoutes = require('./routes/admin-accounts');
const adminSettingsRoutes = require('./routes/admin-settings');
const adminBuybackRoutes = require('./routes/admin-buybacks');

const app = express();
const port = Number(process.env.PORT) || 3002;
const dbName = process.env.DB_NAME;
const mongoUri = process.env.MONGODB_URI;

const adminAuth = createAdminAuth(() => database);
app.use(['/api/admin/auth', '/api/admin/vouchers', '/api/admin/accounts', '/api/admin/news', '/api/admin/events', '/api/admin/settings', '/api/admin/buybacks', '/api/admin/books', '/api/admin/orders', '/api/admin/returns', '/api/admin/dashboard', '/api/admin/banners'], adminAuth.cors);

app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:4201'],
  exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length'],
}));
app.use(express.json());
app.use(morgan('combined'));
app.use('/media/events', express.static(require('node:path').join(__dirname, 'public', 'events'), {
  index: false, dotfiles: 'deny', maxAge: '1h',
}));

let database;
let client;

app.use('/api/admin', require('./middleware/admin-audit-log')(() => database));
app.use('/api/admin', require('./middleware/admin-qa-access')(adminAuth));

app.use('/api/admin/auth', adminAuthRoutes(() => database));
app.use('/api/admin', adminVouchersRoutes(() => database));
app.use('/api/admin/accounts', adminAccountsRoutes(() => database));
app.use('/api/admin/settings', adminSettingsRoutes(() => database));
app.use('/api/admin/buybacks', adminBuybackRoutes(() => database));

app.get('/', (req, res) => {
  res.json({
    message: 'LightBooks RESTful API',
    status: 'running'
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await database.command({ ping: 1 });

    res.json({
      status: 'ok',
      database: dbName,
      mongodb: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'Database is unavailable'
    });
  }
});

function listParam(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

app.get('/api/books', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 500);
    const sortOptions = {
      newest: { createdAt: -1, _id: -1 },
      updated: { updatedAt: -1 }
    };
    const sort = sortOptions[req.query.sort] || {};

    const filter = { status: 'active' };
    if (req.query.discounted === 'true') {
      filter.discountPercent = { $gt: 0 };
    }
    const formats = listParam(req.query.format);
    if (formats.length) filter.bookType = { $in: formats };
    const conditions = listParam(req.query.condition);
    if (conditions.length) filter.condition = { $in: conditions };

    const books = await database
      .collection('books')
      .find(filter)
      .sort(sort)
      .limit(limit)
      .toArray();

    const ready = await require('./routes/admin-books').verifiedPdfBooks(database, books);
    res.json(books.map(book => customerRoutes.publicBook(book.bookType === 'ebook'
      ? { ...book, ebookReady: ready.has(String(book._id)) } : book)));
  } catch (error) {
    console.error('GET /api/books failed:', error.message);

    res.status(500).json({
      message: 'Cannot retrieve books'
    });
  }
});

app.get('/api/authors', async (req, res) => {
  try {
    const authors = await database
      .collection('authors')
      .find({ status: 'active' })
      .project({ name: 1, desc: 1, img: 1 })
      .toArray();

    res.json(authors);
  } catch (error) {
    console.error('GET /api/authors failed:', error.message);

    res.status(500).json({
      message: 'Cannot retrieve authors'
    });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await database
      .collection('categories')
      .find({ status: 'active' })
      .project({ name: 1, slug: 1 })
      .sort({ name: 1 })
      .toArray();

    res.json(categories);
  } catch (error) {
    console.error('GET /api/categories failed:', error.message);

    res.status(500).json({
      message: 'Cannot retrieve categories'
    });
  }
});

const adminDashboardRoutes = require('./routes/admin-dashboard');
app.use('/api/admin', adminDashboardRoutes(() => database));

const adminBooksRoutes = require('./routes/admin-books');
app.use('/api/admin', adminBooksRoutes(() => database));

const bannersRoutes = require('./routes/admin-banners');
app.use('/api', bannersRoutes(() => database));

const adminOrdersRoutes = require('./routes/admin-orders');
app.use('/api/admin', adminOrdersRoutes(() => database, () => client));

const adminReturnsRoutes = require('./routes/admin-returns');
app.use('/api/admin', adminReturnsRoutes(() => database, () => client));

const newsRoutes = require('./routes/news');
app.use('/api', newsRoutes(() => database));

const eventsRoutes = require('./routes/events');
app.use('/api', eventsRoutes(() => database));
app.use('/api/admin/events', require('./routes/admin-events')(() => database));

const newsletterRoutes = require('./routes/newsletter');
app.use('/api', newsletterRoutes(() => database));

const librarianRoutes = require('./routes/librarian');
app.use('/api', librarianRoutes(() => database));

const customerRoutes = require('./routes/customer');
app.use('/api', customerRoutes(() => database));

async function startServer() {
  try {
    if (!mongoUri || !dbName) {
      throw new Error('Missing MongoDB configuration');
    }

    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });

    await client.connect();
    database = client.db(dbName);
    await database.command({ ping: 1 });
    await database.collection('newsletters').createIndex({ email: 1 }, { unique: true });
    await require('./middleware/prepare-data-flows')(database);

    console.log('MongoDB connected successfully');
    console.log('Database:', dbName);

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
      require('./middleware/mailer').checkMailer().catch(() => undefined);
      require('./middleware/admin-audit-log').recordServerStart(database, port)
        .catch(error => console.error('Không ghi được audit log khởi động:', error.message));
    });
  } catch (error) {
    console.error('Cannot start server:', error.message);
    if (client) await client.close();
    process.exitCode = 1;
  }
}

startServer();
