const createError = require('http-errors');
const permissionService = require('../services/permissionService');

/**
 * Middleware factory for checking resource-based permissions
 * 
 * Usage examples:
 * - checkPermission('users', 'create')
 * - checkPermission('products', ['read', 'update'])
 * - checkPermission('orders', 'read', { domain: 'snf' })
 * 
 * @param {string} resource - Resource name (must exist in permissions config)
 * @param {string|Array} actions - Single action or array of actions
 * @param {Object} options - Additional options for permission checking
 * @returns {Function} - Express middleware function
 */
function checkPermission(resource, actions, options = {}) {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        console.log('[checkPermission] User not authenticated');
        return next(createError(401, 'Authentication required'));
      }

      // Validate resource and action configuration
      const actionsArray = Array.isArray(actions) ? actions : [actions];
      for (const action of actionsArray) {
        const validation = permissionService.validateResourceAction(resource, action);
        if (!validation.isValid) {
          console.error(`[checkPermission] Configuration error: ${validation.message}`);
          return next(createError(500, 'Permission configuration error'));
        }
      }

      // Check if user has permission
      const hasPermission = permissionService.canPerform(req.user, resource, actions, options);
      
      if (hasPermission) {
        console.log(`[checkPermission] Permission granted - User: ${req.user.role}, Resource: ${resource}, Actions: ${JSON.stringify(actions)}`);
        return next();
      }

      // Permission denied
      console.log(`[checkPermission] Permission denied - User: ${req.user.role} (ID: ${req.user.id}), Resource: ${resource}, Actions: ${JSON.stringify(actions)}`);
      
      // Create detailed error for better debugging
      const error = createError(403, `Insufficient permissions to ${Array.isArray(actions) ? actions.join(' and ') : actions} ${resource}`);
      error.code = 'PERMISSION_DENIED';
      error.resource = resource;
      error.actions = actions;
      error.userRole = req.user.role;
      
      return next(error);
    } catch (error) {
      console.error('[checkPermission] Error during permission check:', error);
      return next(createError(500, 'Error checking permissions'));
    }
  };
}

/**
 * Middleware to check if user has any of the specified roles
 * 
 * Usage: requireRole('ADMIN', 'SUPERVISOR')
 * 
 * @param {...string} roles - Role names to check
 * @returns {Function} - Express middleware function
 */
function requireRole(...roles) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return next(createError(401, 'Authentication required'));
      }

      const hasRole = permissionService.hasAnyRole(req.user, roles);
      
      if (hasRole) {
        console.log(`[requireRole] Role check passed - User: ${req.user.role}, Required: ${roles.join(' or ')}`);
        return next();
      }

      console.log(`[requireRole] Role check failed - User: ${req.user.role}, Required: ${roles.join(' or ')}`);
      const error = createError(403, `Access denied. Required role: ${roles.join(' or ')}`);
      error.code = 'ROLE_REQUIRED';
      error.requiredRoles = roles;
      error.userRole = req.user.role;
      
      return next(error);
    } catch (error) {
      console.error('[requireRole] Error during role check:', error);
      return next(createError(500, 'Error checking role'));
    }
  };
}

/**
 * Middleware to check if user is admin
 * 
 * Usage: requireAdmin()
 * 
 * @returns {Function} - Express middleware function
 */
function requireAdmin() {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return next(createError(401, 'Authentication required'));
      }

      const isAdmin = permissionService.isAdmin(req.user);
      
      if (isAdmin) {
        console.log(`[requireAdmin] Admin check passed - User: ${req.user.role}`);
        return next();
      }

      console.log(`[requireAdmin] Admin check failed - User: ${req.user.role}`);
      const error = createError(403, 'Admin access required');
      error.code = 'ADMIN_REQUIRED';
      error.userRole = req.user.role;
      
      return next(error);
    } catch (error) {
      console.error('[requireAdmin] Error during admin check:', error);
      return next(createError(500, 'Error checking admin status'));
    }
  };
}

/**
 * Middleware to check multiple permissions with OR logic
 * User needs to have at least ONE of the specified permissions
 * 
 * Usage: checkAnyPermission([
 *   { resource: 'users', action: 'read' },
 *   { resource: 'orders', action: 'read' }
 * ])
 * 
 * @param {Array} permissionChecks - Array of permission objects
 * @returns {Function} - Express middleware function
 */
function checkAnyPermission(permissionChecks) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return next(createError(401, 'Authentication required'));
      }

      if (!Array.isArray(permissionChecks) || permissionChecks.length === 0) {
        return next(createError(500, 'Invalid permission configuration'));
      }

      // Check if user has any of the specified permissions
      const hasAnyPermission = permissionChecks.some(check => {
        const { resource, action, options = {} } = check;
        return permissionService.canPerform(req.user, resource, action, options);
      });

      if (hasAnyPermission) {
        console.log(`[checkAnyPermission] Permission granted - User: ${req.user.role}`);
        return next();
      }

      console.log(`[checkAnyPermission] All permissions denied - User: ${req.user.role}`);
      const error = createError(403, 'Insufficient permissions');
      error.code = 'ANY_PERMISSION_DENIED';
      error.checkedPermissions = permissionChecks;
      error.userRole = req.user.role;
      
      return next(error);
    } catch (error) {
      console.error('[checkAnyPermission] Error during permission check:', error);
      return next(createError(500, 'Error checking permissions'));
    }
  };
}

/**
 * Middleware to optionally check permissions (doesn't block if failed)
 * Sets req.hasPermission = true/false for route handler to use
 * 
 * Usage: optionalPermission('users', 'read')
 * 
 * @param {string} resource - Resource name
 * @param {string|Array} actions - Actions to check
 * @param {Object} options - Additional options
 * @returns {Function} - Express middleware function
 */
function optionalPermission(resource, actions, options = {}) {
  return (req, res, next) => {
    try {
      req.hasPermission = false;
      
      if (req.user) {
        req.hasPermission = permissionService.canPerform(req.user, resource, actions, options);
      }
      
      console.log(`[optionalPermission] Optional permission check - User: ${req.user?.role || 'Not authenticated'}, Has Permission: ${req.hasPermission}`);
      return next();
    } catch (error) {
      console.error('[optionalPermission] Error during optional permission check:', error);
      req.hasPermission = false;
      return next();
    }
  };
}

/**
 * Utility middleware to add user permissions to request object
 * Sets req.userPermissions for use in route handlers
 * 
 * Usage: attachUserPermissions()
 * 
 * @returns {Function} - Express middleware function
 */
function attachUserPermissions() {
  return (req, res, next) => {
    try {
      if (req.user && req.user.role) {
        req.userPermissions = permissionService.getUserPermissions(req.user.role);
        console.log(`[attachUserPermissions] User permissions attached for role: ${req.user.role}`);
      } else {
        req.userPermissions = {};
      }
      
      return next();
    } catch (error) {
      console.error('[attachUserPermissions] Error attaching user permissions:', error);
      req.userPermissions = {};
      return next();
    }
  };
}

module.exports = {
  checkPermission,
  requireRole,
  requireAdmin,
  checkAnyPermission,
  optionalPermission,
  attachUserPermissions
};