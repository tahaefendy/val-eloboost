const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdminSubdomain } = require('../middleware/subdomain');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Enforce admin subdomain check (admin.kodteslimal.com)
router.use(requireAdminSubdomain);

// Public auth endpoints
router.post('/login', adminController.login);

// Protected endpoints (JWT required)
router.use(authenticateToken);

// Order credentials viewing (Assigned booster or admin/managers)
router.get('/orders/:id/credentials', adminController.getOrderCredentials);

// Status and current rank changes (Assigned booster or admin/managers)
router.put('/orders/:id/status', adminController.updateOrderStatus);

// List orders (assigned for boosters, all for admin/managers)
router.get('/orders', adminController.getOrders);

// Admin & Manager ONLY endpoints
router.use(requireRole('admin', 'manager'));

// User creation
router.post('/users', adminController.createUser);
router.delete('/users/:id', adminController.deleteUser);

// Create stock keys
router.post('/keys', adminController.createStockKey);

// List boosters for dropdown selection
router.get('/boosters', adminController.listBoosters);

// Reassign order manually
router.post('/orders/:id/reassign', adminController.reassignOrder);
router.put('/orders/:id/reassign', adminController.reassignOrder);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
