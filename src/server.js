const express = require('express');
const { sequelize } = require('./models');
const { subdomainDetector } = require('./middleware/subdomain');
const corsMiddleware = require('./middleware/cors');
const adminRoutes = require('./routes/admin');
const customerRoutes = require('./routes/customer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Subdomain Detection Middleware
app.use(subdomainDetector);

// Dynamic CORS configuration
app.use(corsMiddleware);

// Serve static frontend files based on subdomain routing
app.use((req, res, next) => {
  // Let API endpoints pass directly to routers
  const apiPaths = [
    '/verify-key', '/create-order', '/orders', 
    '/login', '/users', '/keys', 
    '/boosters', '/audit-logs'
  ];
  
  const isApi = apiPaths.some(p => req.path.startsWith(p));
  if (isApi) {
    return next();
  }

  if (req.isSiteAdmin) {
    return express.static(path.join(__dirname, '../public/admin'))(req, res, next);
  } else {
    return express.static(path.join(__dirname, '../public/customer'))(req, res, next);
  }
});

// Routing based on subdomain detector
app.use((req, res, next) => {
  if (req.isSiteAdmin) {
    // Forward to administrative routes
    return adminRoutes(req, res, next);
  } else {
    // Forward to customer routes
    return customerRoutes(req, res, next);
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Bir iç sunucu hatası oluştu.'
  });
});

// Database synchronization and server launch
async function startServer() {
  try {
    // Sync models with Database (alter structure for development/demo safety)
    await sequelize.authenticate();
    console.log('Veritabanı bağlantısı başarılı.');

    await sequelize.sync({ alter: true });
    console.log('Veritabanı tabloları senkronize edildi.');

    app.listen(PORT, () => {
      console.log(`Sunucu ${PORT} portunda çalışıyor.`);
      console.log(`Müşteri Domaini: http://localhost:${PORT} veya http://kodteslimal.com`);
      console.log(`Yönetim Domaini: http://admin.localhost:${PORT} veya http://admin.kodteslimal.com`);
    });
  } catch (error) {
    console.error('Sunucu başlatılamadı:', error);
    process.exit(1);
  }
}

// Check if run directly (not imported in tests)
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
