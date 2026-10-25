
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');

const app = express();
const port = Number(process.env.PORT) || 3002;
const dbName = process.env.DB_NAME;
const mongoUri = process.env.MONGODB_URI;

app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:4201']
}));
app.use(express.json());
app.use(morgan('combined'));

let database;
let client;

// API kiểm tra Web Server
app.get('/', (req, res) => {
  res.json({
    message: 'LightBooks RESTful API',
    status: 'running'
  });
});

// API kiểm tra trạng thái kết nối MongoDB
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

// API lấy danh sách sách từ MongoDB
// Tham số tuỳ chọn:
//   ?limit=50          số sách trả về (mặc định 20, tối đa 200)
//   ?sort=newest       mới tạo trước | sort=updated: mới cập nhật trước
//   ?discounted=true   chỉ lấy sách đang giảm giá
app.get('/api/books', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
    const sortOptions = {
      newest: { createdAt: -1 },
      updated: { updatedAt: -1 }
    };
    const sort = sortOptions[req.query.sort] || {};

    const filter = { status: 'active' };
    if (req.query.discounted === 'true') {
      filter.discountPercent = { $gt: 0 };
    }

    const books = await database
      .collection('books')
      .find(filter)
      .sort(sort)
      .limit(limit)
      .toArray();

    res.json(books);
  } catch (error) {
    console.error('GET /api/books failed:', error.message);

    res.status(500).json({
      message: 'Cannot retrieve books'
    });
  }
});

// API lấy danh sách tác giả
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

// API lấy danh sách thể loại
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

// Kết nối database trước khi mở server
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

    console.log('MongoDB connected successfully');
    console.log('Database:', dbName);

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Cannot start server:', error.message);
    if (client) await client.close();
    process.exitCode = 1;
  }
}

startServer();
