const permissionsConfig = require('../config/permissions.config');

/**
 * Permission Service
 * 
 * Handles all permission checking logic based on the permissions configuration.
 * Supports resource-based permissions, role hierarchy, and special permission types.
 */
class PermissionService {
  
  /**
   * Check if a user has permission to perform an action on a resource
   * @param {Object} user - User object with role property
   * @param {string} resource - Resource name (e.g., 'users', 'products')
   * @param {string|Array} actions - Single action or array of actions
   * @param {Object} options - Additional options for permission checking
   * @returns {boolean} - True if user has permission
   */
  canPerform(user, resource, actions, options = {}) {
    // Handle array of actions - user must have ALL permissions
    if (Array.isArray(actions)) {
      return actions.every(action => this.canPerform(user, resource, action, options));
    }

    const action = actions;

    // Check if user exists and has a role
    if (!user || !user.role) {
      console.log('[PermissionService] User or user role not found');
      return false;
    }

    const userRole = user.role;

    // Check public resources first
    if (this.isPublicResource(resource, action)) {
      return true;
    }

    // Check if resource exists in configuration
    const resourceConfig = permissionsConfig.resources[resource];
    if (!resourceConfig) {
      console.log(`[PermissionService] Resource '${resource}' not found in configuration`);
      return false;
    }

    // Check if action exists for resource
    if (!resourceConfig.actions.includes(action)) {
      console.log(`[PermissionService] Action '${action}' not defined for resource '${resource}'`);
      return false;
    }

    // Get allowed roles for this resource and action
    const allowedRoles = resourceConfig.roles[action] || [];

    // Check for wildcard permission (all authenticated users)
    if (allowedRoles.includes('*')) {
      return true;
    }

    // Check direct role permission
    if (allowedRoles.includes(userRole)) {
      return true;
    }

    // Check role hierarchy
    if (this.hasPermissionThroughHierarchy(userRole, allowedRoles)) {
      return true;
    }

    // Check domain-specific permissions
    if (options.domain && this.hasDomainPermission(user, resource, options.domain)) {
      return true;
    }

    // Check composite permissions
    if (this.hasCompositePermission(userRole, resource, action)) {
      return true;
    }

    console.log(`[PermissionService] Permission denied - User: ${userRole}, Resource: ${resource}, Action: ${action}`);
    return false;
  }

  /**
   * Check if user has any of the specified roles
   * @param {Object} user - User object
   * @param {Array} roles - Array of role names
   * @returns {boolean}
   */
  hasAnyRole(user, roles) {
    if (!user || !user.role || !Array.isArray(roles)) {
      return false;
    }

    const userRole = user.role;
    
    // Direct role check
    if (roles.includes(userRole)) {
      return true;
    }

    // Check through hierarchy
    return this.hasPermissionThroughHierarchy(userRole, roles);
  }

  /**
   * Check if user is an admin
   * @param {Object} user - User object
   * @returns {boolean}
   */
  isAdmin(user) {
    if (!user || !user.role) {
      return false;
    }
    return permissionsConfig.adminRoles.includes(user.role);
  }

  /**
   * Get all permissions for a user role
   * @param {string} role - Role name
   * @returns {Object} - Object with resources and their allowed actions
   */
  getUserPermissions(role) {
    const permissions = {};
    
    // Get role hierarchy to check inherited permissions
    const effectiveRoles = this.getEffectiveRoles(role);
    
    // Check each resource
    Object.keys(permissionsConfig.resources).forEach(resource => {
      const resourceConfig = permissionsConfig.resources[resource];
      permissions[resource] = [];
      
      // Check each action
      resourceConfig.actions.forEach(action => {
        const allowedRoles = resourceConfig.roles[action] || [];
        
        // Check if user has permission through any effective role
        if (allowedRoles.includes('*') || 
            effectiveRoles.some(r => allowedRoles.includes(r))) {
          permissions[resource].push(action);
        }
      });
    });
    
    return permissions;
  }

  /**
   * Check if a resource/action combination is public
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {boolean}
   */
  isPublicResource(resource, action) {
    const publicResources = permissionsConfig.publicResources || {};
    return publicResources[resource]?.includes(action) || false;
  }

  /**
   * Check permission through role hierarchy
   * @param {string} userRole - User's role
   * @param {Array} allowedRoles - Roles that have permission
   * @returns {boolean}
   */
  hasPermissionThroughHierarchy(userRole, allowedRoles) {
    const hierarchy = permissionsConfig.roleHierarchy || {};
    
    // Check if any of the allowed roles are in user's hierarchy
    return allowedRoles.some(allowedRole => {
      // Check if user's role includes the allowed role
      return hierarchy[userRole]?.includes(allowedRole);
    });
  }

  /**
   * Check domain-specific permissions
   * @param {Object} user - User object
   * @param {string} resource - Resource name
   * @param {string} domain - Domain name
   * @returns {boolean}
   */
  hasDomainPermission(user, resource, domain) {
    const domains = permissionsConfig.domains || {};
    const domainConfig = domains[domain];
    
    if (!domainConfig || !domainConfig[resource]) {
      return false;
    }
    
    const allowedRoles = domainConfig[resource];
    return allowedRoles.includes('*') || 
           allowedRoles.includes(user.role) ||
           this.hasPermissionThroughHierarchy(user.role, allowedRoles);
  }

  /**
   * Check composite permissions
   * @param {string} userRole - User's role
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {boolean}
   */
  hasCompositePermission(userRole, resource, action) {
    const composite = permissionsConfig.compositePermissions || {};
    
    // Check fullAccess permission
    if (composite.fullAccess?.[resource]?.includes(userRole)) {
      return true;
    }
    
    // Check readOnly permission for read actions
    if (action === 'read' && composite.readOnly?.[resource]?.includes(userRole)) {
      return true;
    }
    
    return false;
  }

  /**
   * Get all effective roles for a user (including hierarchy)
   * @param {string} role - User's primary role
   * @returns {Array} - Array of all effective roles
   */
  getEffectiveRoles(role) {
    const hierarchy = permissionsConfig.roleHierarchy || {};
    const effectiveRoles = [role];
    
    // Add all roles from hierarchy
    if (hierarchy[role]) {
      effectiveRoles.push(...hierarchy[role]);
    }
    
    return effectiveRoles;
  }

  /**
   * Validate if a resource and action exist in configuration
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {Object} - Validation result with isValid and message
   */
  validateResourceAction(resource, action) {
    const resourceConfig = permissionsConfig.resources[resource];
    
    if (!resourceConfig) {
      return {
        isValid: false,
        message: `Resource '${resource}' not found in configuration`
      };
    }
    
    if (!resourceConfig.actions.includes(action)) {
      return {
        isValid: false,
        message: `Action '${action}' not defined for resource '${resource}'. Available actions: ${resourceConfig.actions.join(', ')}`
      };
    }
    
    return { isValid: true, message: 'Valid' };
  }

  /**
   * Get all available resources and their actions
   * @returns {Object} - Object with all resources and actions
   */
  getAvailablePermissions() {
    const result = {};
    
    Object.keys(permissionsConfig.resources).forEach(resource => {
      result[resource] = {
        actions: permissionsConfig.resources[resource].actions,
        roles: permissionsConfig.resources[resource].roles
      };
    });
    
    return result;
  }
}

// Export singleton instance
module.exports = new PermissionService();