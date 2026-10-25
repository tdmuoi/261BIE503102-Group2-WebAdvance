
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
app.get('/api/books', async (req, res) => {
  try {
    const books = await database
      .collection('books')
      .find({})
      .limit(20)
      .toArray();

    res.json(books);
  } catch (error) {
    console.error('GET /api/books failed:', error.message);

    res.status(500).json({
      message: 'Cannot retrieve books'
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
