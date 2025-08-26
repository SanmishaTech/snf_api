const express = require('express');
const router = express.Router();

// Import authentication middleware (existing)
const authMiddleware = require('../middleware/auth');

// Import our new permission middleware
const {
  checkPermission,
  requireRole,
  requireAdmin,
  checkAnyPermission,
  optionalPermission,
  attachUserPermissions
} = require('../middleware/checkPermission');

// Import test controller
const testController = require('../controllers/testPermissionController');

/**
 * Test Permission Routes
 * 
 * These routes demonstrate different ways to use the permission system:
 * - Role-based access (admin, specific roles)
 * - Resource-action permissions (create, read, update, delete)
 * - Multiple permission requirements
 * - Optional permissions
 * - Permission information endpoints
 */

// ===== ADMIN-ONLY ROUTES =====

/**
 * GET /test-permissions/admin-only
 * Requires: ADMIN role only
 * Demonstrates: Simple admin-only access
 */
router.get('/admin-only',
  authMiddleware,
  requireAdmin(),
  testController.adminOnly
);

/**
 * GET /test-permissions/admin-or-supervisor
 * Requires: ADMIN or SUPERVISOR role
 * Demonstrates: Multiple role requirement
 */
router.get('/admin-or-supervisor',
  authMiddleware,
  requireRole('ADMIN', 'SUPERVISOR'),
  testController.adminOnly
);

// ===== RESOURCE-BASED PERMISSION ROUTES =====

/**
 * GET /test-permissions/resources
 * Requires: testResource.read permission
 * Demonstrates: Resource-action based permission
 */
router.get('/resources',
  authMiddleware,
  checkPermission('testResource', 'read'),
  testController.listTestResources
);

/**
 * GET /test-permissions/resources/:id
 * Requires: testResource.read permission
 * Demonstrates: Reading a specific resource
 */
router.get('/resources/:id',
  authMiddleware,
  checkPermission('testResource', 'read'),
  testController.readTestResource
);

/**
 * POST /test-permissions/resources
 * Requires: testResource.create permission
 * Demonstrates: Creating a new resource
 */
router.post('/resources',
  authMiddleware,
  checkPermission('testResource', 'create'),
  testController.createTestResource
);

/**
 * PUT /test-permissions/resources/:id
 * Requires: testResource.update permission
 * Demonstrates: Updating an existing resource
 */
router.put('/resources/:id',
  authMiddleware,
  checkPermission('testResource', 'update'),
  testController.updateTestResource
);

/**
 * DELETE /test-permissions/resources/:id
 * Requires: testResource.delete permission
 * Demonstrates: Deleting a resource
 */
router.delete('/resources/:id',
  authMiddleware,
  checkPermission('testResource', 'delete'),
  testController.deleteTestResource
);

// ===== MULTIPLE PERMISSIONS ROUTES =====

/**
 * POST /test-permissions/resources/:id/modify
 * Requires: BOTH testResource.read AND testResource.update permissions
 * Demonstrates: Multiple permissions required (AND logic)
 */
router.post('/resources/:id/modify',
  authMiddleware,
  checkPermission('testResource', ['read', 'update']),
  testController.multiplePermissions
);

/**
 * GET /test-permissions/flexible-access
 * Requires: ANY of the specified permissions
 * Demonstrates: Multiple permission options (OR logic)
 */
router.get('/flexible-access',
  authMiddleware,
  checkAnyPermission([
    { resource: 'testResource', action: 'read' },
    { resource: 'users', action: 'read' },
    { resource: 'products', action: 'read' }
  ]),
  testController.readTestResource
);

// ===== OPTIONAL PERMISSION ROUTES =====

/**
 * GET /test-permissions/optional-create
 * Optional: testResource.create permission
 * Demonstrates: Different content based on permission
 * Note: This route is accessible to all authenticated users,
 *       but shows different content based on permissions
 */
router.get('/optional-create',
  authMiddleware,
  optionalPermission('testResource', 'create'),
  testController.optionalPermissionTest
);

// ===== PERMISSION INFORMATION ROUTES =====

/**
 * GET /test-permissions/my-permissions
 * Requires: Authentication only
 * Returns: All permissions for the current user's role
 */
router.get('/my-permissions',
  authMiddleware,
  testController.getUserPermissions
);

/**
 * GET /test-permissions/available-permissions
 * Requires: ADMIN role
 * Returns: All available permissions in the system
 */
router.get('/available-permissions',
  authMiddleware,
  requireAdmin(),
  testController.getAvailablePermissions
);

/**
 * GET /test-permissions/role-hierarchy
 * Requires: Authentication only
 * Returns: Role hierarchy information for current user
 */
router.get('/role-hierarchy',
  authMiddleware,
  testController.roleHierarchyTest
);

// ===== REAL-WORLD EXAMPLE ROUTES =====

/**
 * GET /test-permissions/users-demo
 * Requires: users.list permission
 * Demonstrates: Permission for actual user resource
 */
router.get('/users-demo',
  authMiddleware,
  checkPermission('users', 'list'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Users list permission granted!',
      note: 'This demonstrates permission for the real "users" resource',
      user: { id: req.user.id, role: req.user.role }
    });
  }
);

/**
 * GET /test-permissions/products-demo
 * Requires: products.read permission (should work for all authenticated users due to '*' in config)
 * Demonstrates: Wildcard permission
 */
router.get('/products-demo',
  authMiddleware,
  checkPermission('products', 'read'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Products read permission granted!',
      note: 'This should work for all authenticated users (wildcard permission)',
      user: { id: req.user.id, role: req.user.role }
    });
  }
);

/**
 * POST /test-permissions/orders-demo
 * Requires: orders.create permission
 * Demonstrates: Order creation permission
 */
router.post('/orders-demo',
  authMiddleware,
  checkPermission('orders', 'create'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Orders create permission granted!',
      note: 'This demonstrates permission for creating orders',
      allowedRoles: 'ADMIN, MEMBER, AGENCY (as per config)',
      user: { id: req.user.id, role: req.user.role }
    });
  }
);

// ===== COMPLEX PERMISSION DEMONSTRATIONS =====

/**
 * GET /test-permissions/inventory-read
 * Requires: inventory.read permission
 * Demonstrates: Depot/warehouse related permissions
 */
router.get('/inventory-read',
  authMiddleware,
  checkPermission('inventory', 'read'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Inventory read permission granted!',
      note: 'Available to ADMIN, DepotAdmin, SUPERVISOR',
      user: { id: req.user.id, role: req.user.role }
    });
  }
);

/**
 * POST /test-permissions/reports-generate
 * Requires: reports.generate permission
 * Demonstrates: Admin-only report generation
 */
router.post('/reports-generate',
  authMiddleware,
  checkPermission('reports', 'generate'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Reports generate permission granted!',
      note: 'Only ADMIN can generate reports (as per config)',
      user: { id: req.user.id, role: req.user.role }
    });
  }
);

/**
 * POST /test-permissions/wallet-transfer
 * Requires: wallets.transfer permission
 * Demonstrates: Financial operation permission
 */
router.post('/wallet-transfer',
  authMiddleware,
  checkPermission('wallets', 'transfer'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Wallet transfer permission granted!',
      note: 'Only ADMIN can perform wallet transfers',
      user: { id: req.user.id, role: req.user.role }
    });
  }
);

// ===== ERROR DEMONSTRATION ROUTES =====

/**
 * GET /test-permissions/invalid-resource
 * Demonstrates: What happens with invalid resource
 * This should return a 500 error due to invalid configuration
 */
router.get('/invalid-resource',
  authMiddleware,
  checkPermission('nonExistentResource', 'read'),
  (req, res) => {
    res.json({ message: 'This should not be reached' });
  }
);

/**
 * GET /test-permissions/invalid-action
 * Demonstrates: What happens with invalid action
 * This should return a 500 error due to invalid action
 */
router.get('/invalid-action',
  authMiddleware,
  checkPermission('testResource', 'invalidAction'),
  (req, res) => {
    res.json({ message: 'This should not be reached' });
  }
);

// ===== UTILITY ROUTES =====

/**
 * GET /test-permissions/health
 * No authentication required
 * Simple health check for the permission system
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Permission system test routes are working',
    timestamp: new Date().toISOString(),
    endpoints: {
      adminOnly: 'GET /test-permissions/admin-only',
      resources: 'GET /test-permissions/resources',
      createResource: 'POST /test-permissions/resources',
      myPermissions: 'GET /test-permissions/my-permissions',
      roleHierarchy: 'GET /test-permissions/role-hierarchy'
    }
  });
});

module.exports = router;