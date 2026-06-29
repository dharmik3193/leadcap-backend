// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const { initializeDatabase } = require('./config/db');
const leadsRouter = require('./routes/leads');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/leads', leadsRouter);
app.use('/webhook', leadsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Home endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Meta Leads Backend Server',
    status: 'Running',
    endpoints: {
      health: 'GET /health',
      leads: 'GET /api/leads',
      webhook: 'POST /webhook/leads',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`\n╔════════════════════════════════════════╗`);
      console.log(`║  Meta Leads Backend Server Started    ║`);
      console.log(`║  Port: ${PORT}${' '.repeat(28 - PORT.toString().length)}║`);
      console.log(`║  URL: http://localhost:${PORT}${' '.repeat(26 - PORT.toString().length)}║`);
      console.log(`║  Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(19 - (process.env.NODE_ENV || 'development').length)}║`);
      console.log(`╚════════════════════════════════════════╝\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nSIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer();

module.exports = app;