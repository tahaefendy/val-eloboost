const cors = require('cors');
require('dotenv').config();

const customerDomain = process.env.CUSTOMER_DOMAIN || 'kodteslimal.com';
const adminDomain = process.env.ADMIN_DOMAIN || 'admin.kodteslimal.com';

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server or REST client requests (no origin header)
    if (!origin) return callback(null, true);

    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();

      const allowedDomains = [
        customerDomain.toLowerCase(),
        adminDomain.toLowerCase(),
        'localhost',
        '127.0.0.1'
      ];

      const isAllowed = allowedDomains.some(domain => {
        return hostname === domain || hostname.endsWith('.' + domain);
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('CORS politika engeli: Origin yetkilendirilmedi.'));
      }
    } catch (e) {
      callback(new Error('Geçersiz Origin formatı.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

module.exports = cors(corsOptions);
