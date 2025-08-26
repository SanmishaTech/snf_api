# 🔐 SNF API Permission System

A powerful, file-based Role-Based Access Control (RBAC) system for granular permission management without database complexity.

## 🚀 Quick Start

### 1. Test the System
```bash
# Health check (no auth required)
GET /api/test-permissions/health

# Admin-only endpoint (requires ADMIN role)
GET /api/test-permissions/admin-only
Authorization: Bearer <your_admin_token>

# Check your permissions
GET /api/test-permissions/my-permissions
Authorization: Bearer <your_token>
```

### 2. Use in Your Routes
```javascript
const { checkPermission, requireAdmin } = require('../middleware/checkPermission');
const auth = require('../middleware/auth');

// Basic permission
router.get('/users', 
  auth, 
  checkPermission('users', 'read'),
  controller.getUsers
);

// Admin only
router.delete('/users/:id',
  auth,
  requireAdmin(),
  controller.deleteUser
);
```

## 🎯 Key Features

- ✅ **No Database Changes** - Pure file-based configuration
- ✅ **CRUD Permissions** - Create, Read, Update, Delete for any resource
- ✅ **Role Hierarchy** - Roles inherit permissions from lower roles
- ✅ **Flexible Middleware** - Multiple options for different use cases
- ✅ **Wildcard Support** - `'*'` for all authenticated users
- ✅ **Easy to Maintain** - Single config file for all permissions
- ✅ **Backward Compatible** - Works with existing auth system

## 📋 Available Permissions

### Core Resources
| Resource | Actions | Admin | DepotAdmin | Supervisor | Agency | Vendor | Member |
|----------|---------|-------|------------|------------|---------|---------|---------|
| **users** | create, read, update, delete, list, export | ✅ | ❌ | ❌ | ❌ | ❌ | read only |
| **products** | create, read, update, delete, list | ✅ | ❌ | ❌ | ❌ | create,read,update | read only |
| **orders** | create, read, update, delete, list, approve | ✅ | ❌ | approve | read,update,list | ❌ | create,read |
| **agencies** | create, read, update, delete, list | ✅ | ❌ | ❌ | read,update | ❌ | ❌ |
| **inventory** | create, read, update, delete, list, transfer | ✅ | all actions | read,list | ❌ | ❌ | ❌ |
| **reports** | read, export, generate | ✅ | read,export | read,export | ❌ | ❌ | ❌ |
| **wallets** | read, update, transfer, approve | ✅ | ❌ | ❌ | ❌ | ❌ | read only |

### Role Hierarchy
```
ADMIN
├── DepotAdmin
│   └── SUPERVISOR
│       └── AGENCY
├── VENDOR
└── MEMBER
```
*Higher roles inherit permissions from lower roles*

## 🛠️ Middleware Options

### `checkPermission(resource, actions)`
Check specific resource permissions.
```javascript
// Single permission
checkPermission('users', 'create')

// Multiple permissions (AND logic)
checkPermission('orders', ['read', 'update'])
```

### `requireRole(...roles)`
Require specific roles (OR logic).
```javascript
// Single role
requireRole('ADMIN')

// Multiple roles
requireRole('ADMIN', 'SUPERVISOR')
```

### `requireAdmin()`
Require admin privileges.
```javascript
requireAdmin() // ADMIN or DepotAdmin
```

### `checkAnyPermission(permissions)`
Check multiple permission options (OR logic).
```javascript
checkAnyPermission([
  { resource: 'users', action: 'read' },
  { resource: 'orders', action: 'read' }
])
```

### `optionalPermission(resource, action)`
Non-blocking permission check.
```javascript
// Sets req.hasPermission = true/false
optionalPermission('users', 'create')
```

## 🧪 Test Endpoints

### Basic Tests
```bash
# Test different permission levels
GET /api/test-permissions/resources              # Read permission
POST /api/test-permissions/resources             # Create permission  
PUT /api/test-permissions/resources/123          # Update permission
DELETE /api/test-permissions/resources/123       # Delete permission
```

### Real Resource Tests
```bash
# Test actual resource permissions
GET /api/test-permissions/users-demo             # users.list permission
GET /api/test-permissions/products-demo          # products.read (wildcard)
POST /api/test-permissions/orders-demo           # orders.create permission
```

### Information Endpoints
```bash
GET /api/test-permissions/my-permissions         # Your permissions
GET /api/test-permissions/role-hierarchy         # Role hierarchy info
GET /api/test-permissions/available-permissions  # All system permissions (Admin only)
```

## ⚡ Usage Examples

### Basic CRUD Operations
```javascript
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

// Create user (Admin only)
router.post('/users',
  auth,
  checkPermission('users', 'create'),
  userController.create
);

// List users (Admin only)
router.get('/users',
  auth,
  checkPermission('users', 'list'),
  userController.list
);

// Get user (Admin and Member can read)
router.get('/users/:id',
  auth,
  checkPermission('users', 'read'),
  userController.getById
);

// Update user (Admin only)
router.put('/users/:id',
  auth,
  checkPermission('users', 'update'),
  userController.update
);

// Delete user (Admin only)
router.delete('/users/:id',
  auth,
  checkPermission('users', 'delete'),
  userController.delete
);
```

### Advanced Patterns
```javascript
// Multiple permissions required
router.put('/orders/:id/approve',
  auth,
  checkPermission('orders', ['read', 'approve']),
  orderController.approve
);

// Flexible access (any of these permissions)
router.get('/dashboard',
  auth,
  checkAnyPermission([
    { resource: 'users', action: 'read' },
    { resource: 'orders', action: 'read' },
    { resource: 'products', action: 'read' }
  ]),
  dashboardController.index
);

// Optional permission for enhanced features
router.get('/products',
  auth,
  optionalPermission('products', 'create'), // Sets req.hasPermission
  (req, res) => {
    const response = { products: getProducts() };
    
    // Add create button if user has permission
    if (req.hasPermission) {
      response.canCreate = true;
      response.createEndpoint = '/api/products';
    }
    
    res.json(response);
  }
);
```

## 🎛️ Configuration

All permissions are defined in `src/config/permissions.config.js`:

```javascript
module.exports = {
  resources: {
    // Add new resources here
    myResource: {
      actions: ['create', 'read', 'update', 'delete'],
      roles: {
        create: ['ADMIN'],
        read: ['ADMIN', 'MEMBER'],
        update: ['ADMIN'],
        delete: ['ADMIN']
      }
    }
  },
  
  // Role inheritance
  roleHierarchy: {
    ADMIN: ['DepotAdmin', 'SUPERVISOR', 'AGENCY', 'VENDOR', 'MEMBER'],
    DepotAdmin: ['SUPERVISOR']
  }
};
```

## 🚨 Error Responses

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

### Admin Required (403)
```json
{
  "error": "Admin access required", 
  "code": "ADMIN_REQUIRED",
  "userRole": "MEMBER"
}
```

## 🔧 Adding New Permissions

### 1. Add to Configuration
```javascript
// src/config/permissions.config.js
resources: {
  newResource: {
    actions: ['create', 'read', 'update', 'delete', 'customAction'],
    roles: {
      create: ['ADMIN'],
      read: ['ADMIN', 'MEMBER'], 
      update: ['ADMIN'],
      delete: ['ADMIN'],
      customAction: ['ADMIN', 'SUPERVISOR']
    }
  }
}
```

### 2. Use in Routes
```javascript
router.get('/new-resources',
  auth,
  checkPermission('newResource', 'read'),
  controller.list
);

router.post('/new-resources/:id/custom',
  auth,
  checkPermission('newResource', 'customAction'),
  controller.customAction
);
```

### 3. Test
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/new-resources
```

## 🧩 Integration with Existing Code

### Gradual Migration
You can migrate from existing ACL gradually:

```javascript
// Before (existing)
router.get('/users', auth, acl('USERS_LIST'), controller.list);

// After (new permissions) 
router.get('/users', auth, checkPermission('users', 'list'), controller.list);
```

### Parallel Usage
Use both systems during transition:
```javascript
// Support both temporarily
router.get('/users',
  auth,
  // Old system
  acl('USERS_LIST'),
  // New system (will be ignored if old succeeds)
  checkPermission('users', 'list'),
  controller.list
);
```

## 📚 Complete Documentation

For detailed documentation, see: `src/docs/PERMISSIONS_SYSTEM.md`

## 🐛 Troubleshooting

### Common Issues

**Permission Always Denied**
- Check resource name spelling in config
- Verify action exists for resource
- Confirm user role is in allowed roles

**Role Hierarchy Not Working**  
- Check role hierarchy configuration
- Verify role name case sensitivity
- Ensure roles exist in User enum

**Middleware Errors**
- Ensure `auth` middleware comes before permission middleware
- Check middleware execution order

### Debug Mode
Check console logs for detailed information:
```
[checkPermission] Permission granted - User: ADMIN, Resource: users, Actions: ["create"]
[checkPermission] Permission denied - User: MEMBER, Resource: users, Actions: ["delete"]
```

## 🏃‍♂️ Quick Test Commands

```bash
# Replace <token> with your actual JWT token

# Test admin access
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:3000/api/test-permissions/admin-only

# Test user permissions
curl -H "Authorization: Bearer <user_token>" \
  http://localhost:3000/api/test-permissions/my-permissions

# Test resource access
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/test-permissions/resources

# Test create permission
curl -X POST \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Resource"}' \
  http://localhost:3000/api/test-permissions/resources
```

---

## 🎉 Ready to Use!

The permission system is now active and ready for production use. Start with the test endpoints to familiarize yourself, then apply permissions to your existing routes.

**Need help?** Check the full documentation in `src/docs/PERMISSIONS_SYSTEM.md` or test the endpoints to see examples in action!