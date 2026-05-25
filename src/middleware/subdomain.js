require('dotenv').config();

const customerDomain = process.env.CUSTOMER_DOMAIN || 'kodteslimal.com';
const adminDomain = process.env.ADMIN_DOMAIN || 'admin.kodteslimal.com';

/**
 * Subdomain detector middleware.
 * Sets req.isSiteAdmin to true if the request is destined for the admin domain.
 */
const subdomainDetector = (req, res, next) => {
  const host = req.headers.host || '';
  
  // Strip port if exists (e.g., localhost:3000 -> localhost)
  const hostName = host.split(':')[0].toLowerCase();

  // Check if hostName matches adminDomain or admin subdomain in dev
  if (
    hostName === adminDomain.toLowerCase() ||
    hostName.startsWith('admin.localhost') ||
    hostName.startsWith('admin.kodteslimal')
  ) {
    req.isSiteAdmin = true;
  } else {
    req.isSiteAdmin = false;
  }

  next();
};

/**
 * Route protection middleware to ensure request is from the admin subdomain
 */
const requireAdminSubdomain = (req, res, next) => {
  if (!req.isSiteAdmin) {
    return res.status(403).json({
      error: 'Bu endpoint sadece admin.kodteslimal.com üzerinden erişilebilir.'
    });
  }
  next();
};

/**
 * Route protection middleware to ensure request is from the main customer domain
 */
const requireCustomerSubdomain = (req, res, next) => {
  if (req.isSiteAdmin) {
    return res.status(403).json({
      error: 'Bu endpoint admin domaininden çağrılamaz. Lütfen kodteslimal.com adresini kullanın.'
    });
  }
  next();
};

module.exports = {
  subdomainDetector,
  requireAdminSubdomain,
  requireCustomerSubdomain
};
