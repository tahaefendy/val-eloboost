const jwt = require('jsonwebtoken');
const { User } = require('../models');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwttokenkey123!';

/**
 * Authentication middleware to verify JWT
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Accept token from Bearer header or cookies
  let token = authHeader && authHeader.split(' ')[1];
  
  if (!token && req.cookies) {
    token = req.cookies.admin_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Erişim engellendi. Token bulunamadı.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş token.' });
  }
};

/**
 * Enforces role-based route access
 * @param  {...string} allowedRoles - 'admin', 'manager', 'booster'
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Yetkisiz erişim. Bu işlem için yetkiniz yok. Gerekli yetkiler: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};
