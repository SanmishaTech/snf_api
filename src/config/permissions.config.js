/**
 * Permission Configuration System
 * 
 * This file defines all permissions for resources and actions.
 * Format: resource.action = [allowed_roles]
 * 
 * Special values:
 * - '*' means all authenticated users
 * - 'public' means no authentication required
 * - Role names are case-sensitive and should match User.role enum
 */

module.exports = {
  // Resource-based permissions
  resources: {
    // User management
    users: {
      actions: ['create', 'read', 'update', 'delete', 'list', 'export'],
      roles: {
        create: ['ADMIN'],
        read: ['ADMIN', 'MEMBER'],
        update: ['ADMIN'],
        delete: ['ADMIN'],
        list: ['ADMIN'],
        export: ['ADMIN']
      }
    },

    // Product management
    products: {
      actions: ['create', 'read', 'update', 'delete', 'list'],
      roles: {
        create: ['ADMIN', 'VENDOR'],
        read: ['*'], // All authenticated users can read
        update: ['ADMIN', 'VENDOR'],
        delete: ['ADMIN'],
        list: ['*']
      }
    },

    // Order management
    orders: {
      actions: ['create', 'read', 'update', 'delete', 'list', 'approve'],
      roles: {
        create: ['ADMIN', 'MEMBER', 'AGENCY'],
        read: ['ADMIN', 'MEMBER', 'AGENCY'],
        update: ['ADMIN', 'AGENCY'],
        delete: ['ADMIN'],
        list: ['ADMIN', 'AGENCY'],
        approve: ['ADMIN', 'SUPERVISOR']
      }
    },

    // Agency management
    agencies: {
      actions: ['create', 'read', 'update', 'delete', 'list'],
      roles: {
        create: ['ADMIN'],
        read: ['ADMIN', 'AGENCY'],
        update: ['ADMIN', 'AGENCY'],
        delete: ['ADMIN'],
        list: ['ADMIN']
      }
    },

    // Vendor management
    vendors: {
      actions: ['create', 'read', 'update', 'delete', 'list'],
      roles: {
        create: ['ADMIN'],
        read: ['ADMIN', 'VENDOR', 'DepotAdmin'],
        update: ['ADMIN', 'VENDOR'],
        delete: ['ADMIN'],
        list: ['ADMIN', 'DepotAdmin']
      }
    },

    // Inventory/Stock management
    inventory: {
      actions: ['create', 'read', 'update', 'delete', 'list', 'transfer'],
      roles: {
        create: ['ADMIN', 'DepotAdmin'],
        read: ['ADMIN', 'DepotAdmin', 'SUPERVISOR'],
        update: ['ADMIN', 'DepotAdmin'],
        delete: ['ADMIN'],
        list: ['ADMIN', 'DepotAdmin', 'SUPERVISOR'],
        transfer: ['ADMIN', 'DepotAdmin']
      }
    },

    // Reports
    reports: {
      actions: ['read', 'export', 'generate'],
      roles: {
        read: ['ADMIN', 'SUPERVISOR', 'DepotAdmin'],
        export: ['ADMIN', 'SUPERVISOR'],
        generate: ['ADMIN']
      }
    },

    // Wallet/Financial operations
    wallets: {
      actions: ['read', 'update', 'transfer', 'approve'],
      roles: {
        read: ['ADMIN', 'MEMBER'],
        update: ['ADMIN'],
        transfer: ['ADMIN'],
        approve: ['ADMIN']
      }
    },

    // Test resource for demonstration
    testResource: {
      actions: ['create', 'read', 'update', 'delete'],
      roles: {
        create: ['ADMIN'],
        read: ['ADMIN', 'MEMBER'],
        update: ['ADMIN'],
        delete: ['ADMIN']
      }
    }
  },

  // Role hierarchy - roles inherit permissions from roles they contain
  // Format: higherRole: [lowerRoles]
  roleHierarchy: {
    ADMIN: ['DepotAdmin', 'SUPERVISOR', 'AGENCY', 'VENDOR', 'MEMBER'],
    DepotAdmin: ['SUPERVISOR'],
    SUPERVISOR: ['AGENCY'],
    AGENCY: [],
    VENDOR: [],
    MEMBER: []
  },

  // Admin roles - these roles have access to admin-only features
  adminRoles: ['ADMIN', 'DepotAdmin'],

  // Public resources that don't require authentication
  publicResources: {
    products: ['read', 'list'],
    categories: ['read', 'list'],
    locations: ['read', 'list']
  },

  // Domain-specific permissions (can be used for more granular control)
  domains: {
    // SNF (retail) specific permissions
    snf: {
      orders: ['ADMIN', 'MEMBER'],
      products: ['*'],
      checkout: ['MEMBER']
    },
    
    // Admin dashboard permissions
    admin: {
      dashboard: ['ADMIN', 'DepotAdmin', 'SUPERVISOR'],
      analytics: ['ADMIN', 'DepotAdmin'],
      system: ['ADMIN']
    }
  },

  // Special permissions that combine multiple actions
  compositePermissions: {
    // Full CRUD access
    fullAccess: {
      testResource: ['ADMIN'],
      users: ['ADMIN'],
      products: ['ADMIN', 'VENDOR']
    },
    
    // Read-only access
    readOnly: {
      orders: ['MEMBER'],
      reports: ['AGENCY']
    }
  }
};