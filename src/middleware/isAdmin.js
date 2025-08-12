const createError = require('http-errors');

/**
 * Simple middleware to check if user is an admin
 * This provides backward compatibility with the existing codebase
 */
const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return next(createError(401, 'Unauthorized: user not authenticated'));
    }

    const userRole = String(req.user.role || '');
    
    if (userRole !== 'ADMIN') {
      return next(createError(403, 'Forbidden: Admin access required'));
    }

    next();
  } catch (error) {
    console.error('[isAdmin] error:', error);
    return next(createError(500, 'Server error while checking admin role'));
  }
};

module.exports = isAdmin;
