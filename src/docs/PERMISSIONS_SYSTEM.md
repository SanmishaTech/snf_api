# Permission System Documentation

## Overview

This document describes the file-based Role-Based Access Control (RBAC) permission system implemented for the SNF API. The system provides granular, resource-based permissions that are easy to configure and maintain without requiring database changes.

## Key Features

- **File-based Configuration**: All permissions defined in a single, readable configuration file
- **Resource-Action Based**: Permissions structured as `resource.action` (e.g., `users.create`, `products.read`)
- **Role Hierarchy**: Roles can inherit permissions from other roles
- **Flexible Middleware**: Multiple middleware options for different use cases
- **Backward Compatible**: Works alongside existing ACL system
- **CRUD Support**: Built-in support for Create, Read, Update, Delete operations
- **Wildcard Permissions**: Support for `*` (all authenticated users) and `public` access

## Architecture

### Core Components

1. **Configuration File**: `src/config/permissions.config.js`
2. **Permission Service**: `src/services/permissionService.js`
3. **Middleware**: `src/middleware/checkPermission.js`
4. **Test Routes**: `src/routes/testPermissionRoutes.js` (for testing)

## Configuration Structure

### Basic Permission Structure

```javascript
// src/config/permissions.config.js
module.exports = {
  resources: {
    resourceName: {
      actions: ['create', 'read', 'update', 'delete'],
      roles: {
        create: ['ADMIN', 'ROLE2'],
        read: ['*'], // All authenticated users
        update: ['ADMIN'],
        delete: ['ADMIN']
      }
    }
  }
};
```

### Available Roles

Based on the Prisma schema, the following roles are available:
- `ADMIN`
- `AGENCY` 
- `MEMBER`
- `VENDOR`
- `DepotAdmin`
- `SUPERVISOR`

### Special Permission Values

- `'*'` - All authenticated users
- `'public'` - No authentication required (for public resources)

### Role Hierarchy

```javascript
roleHierarchy: {
  ADMIN: ['DepotAdmin', 'SUPERVISOR', 'AGENCY', 'VENDOR', 'MEMBER'],
  DepotAdmin: ['SUPERVISOR'],
  SUPERVISOR: ['AGENCY'],
  // ... etc
}
```

Higher roles inherit permissions from lower roles in their hierarchy.

## Usage Examples

### Basic Permission Checking

```javascript
const { checkPermission } = require('../middleware/checkPermission');

// Single permission
router.get('/users', 
  auth, 
  checkPermission('users', 'read'),
  controller.getUsers
);

// Multiple permissions (AND logic)
router.put('/users/:id',
  auth,
  checkPermission('users', ['read', 'update']),
  controller.updateUser
);
```

### Role-Based Access

```javascript
const { requireRole, requireAdmin } = require('../middleware/checkPermission');

// Specific roles
router.get('/admin-panel',
  auth,
  requireRole('ADMIN', 'SUPERVISOR'),
  controller.adminPanel
);

// Admin only
router.delete('/users/:id',
  auth,
  requireAdmin(),
  controller.deleteUser
);
```

### Multiple Permission Options (OR logic)

```javascript
const { checkAnyPermission } = require('../middleware/checkPermission');

router.get('/dashboard',
  auth,
  checkAnyPermission([
    { resource: 'users', action: 'read' },
    { resource: 'orders', action: 'read' },
    { resource: 'products', action: 'read' }
  ]),
  controller.dashboard
);
```

### Optional Permissions

```javascript
const { optionalPermission } = require('../middleware/checkPermission');

router.get('/products',
  auth,
  optionalPermission('products', 'create'), // Sets req.hasPermission
  (req, res) => {
    const response = { products: [...] };
    
    // Show additional content if user has create permission
    if (req.hasPermission) {
      response.canCreate = true;
      response.createEndpoint = '/api/products';
    }
    
    res.json(response);
  }
);
```

## Middleware Reference

### checkPermission(resource, actions, options)

Checks if user has specific permissions on a resource.

**Parameters:**
- `resource` (string): Resource name from configuration
- `actions` (string|array): Single action or array of actions (AND logic)
- `options` (object): Additional options (e.g., domain-specific permissions)

**Example:**
```javascript
checkPermission('users', 'create')
checkPermission('orders', ['read', 'update'])
checkPermission('products', 'read', { domain: 'snf' })
```

### requireRole(...roles)

Checks if user has any of the specified roles.

**Parameters:**
- `...roles` (string): Role names to check (OR logic)

**Example:**
```javascript
requireRole('ADMIN', 'SUPERVISOR')
```

### requireAdmin()

Checks if user has admin privileges (defined in `adminRoles` config).

**Example:**
```javascript
requireAdmin()
```

### checkAnyPermission(permissionChecks)

Checks if user has any of the specified permissions (OR logic).

**Parameters:**
- `permissionChecks` (array): Array of permission objects

**Example:**
```javascript
checkAnyPermission([
  { resource: 'users', action: 'read' },
  { resource: 'products', action: 'read' }
])
```

### optionalPermission(resource, actions, options)

Sets `req.hasPermission` boolean without blocking access.

**Parameters:**
- Same as `checkPermission`

**Example:**
```javascript
optionalPermission('users', 'create')
// Later in route handler: if (req.hasPermission) { ... }
```

### attachUserPermissions()

Attaches `req.userPermissions` object with all user's permissions.

**Example:**
```javascript
attachUserPermissions()
// Later: req.userPermissions.users = ['read', 'create']
```

## Permission Service API

The permission service provides programmatic access to permission checking:

```javascript
const permissionService = require('../services/permissionService');

// Check if user can perform action
const canCreate = permissionService.canPerform(user, 'users', 'create');

// Check role
const isAdmin = permissionService.isAdmin(user);
const hasRole = permissionService.hasAnyRole(user, ['ADMIN', 'SUPERVISOR']);

// Get all permissions for role
const permissions = permissionService.getUserPermissions('ADMIN');

// Validate configuration
const validation = permissionService.validateResourceAction('users', 'create');
```

## Test Routes

The system includes comprehensive test routes at `/api/test-permissions/`:

### Available Test Endpoints

#### Basic Permission Tests
- `GET /api/test-permissions/admin-only` - Admin only
- `GET /api/test-permissions/resources` - Read testResource
- `POST /api/test-permissions/resources` - Create testResource
- `PUT /api/test-permissions/resources/:id` - Update testResource
- `DELETE /api/test-permissions/resources/:id` - Delete testResource

#### Real Resource Tests
- `GET /api/test-permissions/users-demo` - Test users.list permission
- `GET /api/test-permissions/products-demo` - Test products.read (wildcard)
- `POST /api/test-permissions/orders-demo` - Test orders.create permission

#### Advanced Tests
- `POST /api/test-permissions/resources/:id/modify` - Multiple permissions
- `GET /api/test-permissions/flexible-access` - Any permission (OR logic)
- `GET /api/test-permissions/optional-create` - Optional permission demo

#### Information Endpoints
- `GET /api/test-permissions/my-permissions` - User's permissions
- `GET /api/test-permissions/available-permissions` - All system permissions
- `GET /api/test-permissions/role-hierarchy` - Role hierarchy info
- `GET /api/test-permissions/health` - System health check

## Error Handling

The system provides detailed error responses:

### Permission Denied (403)
```json
{
  "error": "Insufficient permissions to create users",
  "code": "PERMISSION_DENIED",
  "resource": "users",
  "actions": ["create"],
  "userRole": "MEMBER"
}
```

### Role Required (403)
```json
{
  "error": "Access denied. Required role: ADMIN or SUPERVISOR",
  "code": "ROLE_REQUIRED",
  "requiredRoles": ["ADMIN", "SUPERVISOR"],
  "userRole": "MEMBER"
}
```

### Configuration Error (500)
```json
{
  "error": "Resource 'invalidResource' not found in configuration",
  "code": "CONFIGURATION_ERROR"
}
```

## Best Practices

### 1. Resource Naming
Use clear, descriptive resource names that match your domain:
```javascript
resources: {
  users: { /* ... */ },
  products: { /* ... */ },
  orders: { /* ... */ },
  inventory: { /* ... */ }
}
```

### 2. Action Naming
Stick to standard CRUD operations when possible:
- `create` - Create new resources
- `read` - Read/view resources
- `update` - Modify existing resources
- `delete` - Remove resources
- `list` - List/browse resources

Additional actions for specific needs:
- `approve`, `export`, `transfer`, `generate`, etc.

### 3. Role Hierarchy
Design role hierarchy from most to least privileged:
```javascript
roleHierarchy: {
  ADMIN: ['DepotAdmin', 'SUPERVISOR', 'AGENCY', 'VENDOR', 'MEMBER'],
  DepotAdmin: ['SUPERVISOR'],
  SUPERVISOR: ['AGENCY']
}
```

### 4. Granular Permissions
Define permissions at an appropriate level of granularity:
```javascript
// Good - specific and clear
checkPermission('orders', 'approve')

// Avoid - too generic
checkPermission('admin', 'access')
```

### 5. Error Handling
Always handle permission errors gracefully in your controllers:
```javascript
app.use((err, req, res, next) => {
  if (err.code === 'PERMISSION_DENIED') {
    // Log for security monitoring
    console.log(`Permission denied: ${req.user?.email} tried to ${err.actions.join(',')} ${err.resource}`);
  }
  // ... error response
});
```

## Adding New Resources

To add a new resource to the permission system:

1. **Add to Configuration**:
```javascript
// src/config/permissions.config.js
resources: {
  newResource: {
    actions: ['create', 'read', 'update', 'delete'],
    roles: {
      create: ['ADMIN'],
      read: ['ADMIN', 'MEMBER'],
      update: ['ADMIN'],
      delete: ['ADMIN']
    }
  }
}
```

2. **Use in Routes**:
```javascript
router.get('/new-resources',
  auth,
  checkPermission('newResource', 'read'),
  controller.list
);
```

3. **Test the Permissions**:
```javascript
// Test different user roles
const canRead = permissionService.canPerform(user, 'newResource', 'read');
```

## Migration from Existing ACL

To gradually migrate from the existing ACL system:

1. **Add Parallel Permissions**: Define the same permissions in both systems
2. **Test Routes**: Use test routes to validate new permission behavior  
3. **Gradual Migration**: Replace ACL middleware with new permission middleware route by route
4. **Remove Legacy**: Once all routes migrated, remove old ACL system

Example migration:
```javascript
// Before (existing ACL)
router.get('/users', auth, acl('USERS_LIST'), controller.list);

// After (new permissions)
router.get('/users', auth, checkPermission('users', 'list'), controller.list);
```

## Security Considerations

1. **Principle of Least Privilege**: Grant minimal permissions required
2. **Regular Audits**: Review permission configurations regularly
3. **Logging**: Log permission denials for security monitoring
4. **Input Validation**: Validate resource and action names in middleware
5. **Error Information**: Don't expose sensitive system information in error messages

## Testing

### Manual Testing
Use the provided test routes to manually verify permissions:

```bash
# Test admin access
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:3000/api/test-permissions/admin-only

# Test resource permissions
curl -H "Authorization: Bearer <user_token>" \
  http://localhost:3000/api/test-permissions/resources

# Check user permissions
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/test-permissions/my-permissions
```

### Automated Testing
Consider adding unit tests for the permission service:

```javascript
const permissionService = require('../services/permissionService');

describe('Permission Service', () => {
  it('should allow admin to create users', () => {
    const admin = { role: 'ADMIN' };
    expect(permissionService.canPerform(admin, 'users', 'create')).toBe(true);
  });
  
  it('should deny member from creating users', () => {
    const member = { role: 'MEMBER' };
    expect(permissionService.canPerform(member, 'users', 'create')).toBe(false);
  });
});
```

## Troubleshooting

### Common Issues

1. **Permission Always Denied**
   - Check if resource exists in configuration
   - Verify action is defined for the resource
   - Confirm user role is in allowed roles list

2. **Role Hierarchy Not Working**
   - Verify role hierarchy configuration
   - Check role name spelling (case-sensitive)
   - Ensure roles exist in User enum

3. **Middleware Order Issues**
   - Ensure `auth` middleware comes before permission middleware
   - Check middleware execution order in routes

4. **Configuration Errors**
   - Validate JSON structure in permissions.config.js
   - Check for typos in resource/action names
   - Ensure all referenced roles exist

### Debugging

Enable detailed logging by checking console output for permission checks:
```
[checkPermission] Permission granted - User: ADMIN, Resource: users, Actions: ["create"]
[checkPermission] Permission denied - User: MEMBER, Resource: users, Actions: ["delete"]
```

## Support

For issues or questions about the permission system:
1. Check the test routes for examples
2. Review this documentation
3. Check console logs for detailed error information
4. Validate configuration using the permission service validation methods