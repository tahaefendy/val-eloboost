const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

// Debug deployment endpoint
router.get('/debug-git', (req, res) => {
  res.json({
    status: 'online',
    time: new Date().toISOString(),
    adminPaths: ['/login', '/keys', '/users', '/boosters', '/audit-logs']
  });
});

const { requireCustomerSubdomain } = require('../middleware/subdomain');

// All customer API routes require accessing from the customer domain (e.g. kodteslimal.com)
router.use(requireCustomerSubdomain);

// Verify Key code
router.get('/verify-key/:keyCode', customerController.verifyKey);

// Place elo boost order
router.post('/create-order', customerController.createOrder);

// Track order status live
router.get('/orders/:id', customerController.trackOrder);

module.exports = router;
