const permissionService = require('../services/permissionService');

/**
 * Test Controller for Permission System
 * 
 * This controller provides test endpoints to demonstrate and validate
 * the permissions system functionality
 */

/**
 * Test endpoint - Admin only access
 */
const adminOnly = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Admin access granted!',
      user: {
        id: req.user.id,
        role: req.user.role,
        email: req.user.email
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in adminOnly:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Read test resource
 */
const readTestResource = async (req, res) => {
  try {
    const resourceId = req.params.id || 'test-resource-1';
    
    res.json({
      success: true,
      message: 'Read permission granted!',
      data: {
        id: resourceId,
        name: `Test Resource ${resourceId}`,
        description: 'This is a mock resource for testing permissions',
        createdBy: 'system',
        createdAt: new Date().toISOString()
      },
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in readTestResource:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Create test resource
 */
const createTestResource = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Simulate creating a resource
    const newResource = {
      id: `test-resource-${Date.now()}`,
      name: name || 'New Test Resource',
      description: description || 'Created via permission test',
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    res.status(201).json({
      success: true,
      message: 'Create permission granted! Resource created successfully.',
      data: newResource,
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in createTestResource:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Update test resource
 */
const updateTestResource = async (req, res) => {
  try {
    const resourceId = req.params.id;
    const { name, description } = req.body;
    
    // Simulate updating a resource
    const updatedResource = {
      id: resourceId,
      name: name || `Updated Test Resource ${resourceId}`,
      description: description || 'Updated via permission test',
      updatedBy: req.user.id,
      updatedAt: new Date().toISOString(),
      status: 'updated'
    };

    res.json({
      success: true,
      message: 'Update permission granted! Resource updated successfully.',
      data: updatedResource,
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in updateTestResource:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Delete test resource
 */
const deleteTestResource = async (req, res) => {
  try {
    const resourceId = req.params.id;
    
    res.json({
      success: true,
      message: 'Delete permission granted! Resource deleted successfully.',
      data: {
        id: resourceId,
        deletedBy: req.user.id,
        deletedAt: new Date().toISOString()
      },
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in deleteTestResource:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - List test resources
 */
const listTestResources = async (req, res) => {
  try {
    // Mock data for testing
    const mockResources = [
      {
        id: 'test-resource-1',
        name: 'First Test Resource',
        description: 'Description for first resource',
        status: 'active'
      },
      {
        id: 'test-resource-2',
        name: 'Second Test Resource',
        description: 'Description for second resource',
        status: 'active'
      },
      {
        id: 'test-resource-3',
        name: 'Third Test Resource',
        description: 'Description for third resource',
        status: 'inactive'
      }
    ];

    res.json({
      success: true,
      message: 'List permission granted!',
      data: mockResources,
      total: mockResources.length,
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in listTestResources:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Multiple permissions required (read AND update)
 */
const multiplePermissions = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Multiple permissions (read AND update) granted!',
      data: {
        action: 'read_and_update',
        description: 'This endpoint requires both read and update permissions on testResource'
      },
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in multiplePermissions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Optional permission check
 * Shows different content based on whether user has permission
 */
const optionalPermissionTest = async (req, res) => {
  try {
    // req.hasPermission is set by optionalPermission middleware
    const hasCreatePermission = req.hasPermission;
    
    const baseResponse = {
      success: true,
      message: 'Optional permission test endpoint',
      user: {
        id: req.user.id,
        role: req.user.role
      },
      hasCreatePermission
    };

    if (hasCreatePermission) {
      baseResponse.data = {
        message: 'You have create permission! Here is additional content.',
        adminContent: 'This content is only shown to users with create permission',
        actions: ['create', 'read']
      };
    } else {
      baseResponse.data = {
        message: 'You do not have create permission. Limited content shown.',
        publicContent: 'This is basic content for users without create permission',
        actions: ['read']
      };
    }

    res.json(baseResponse);
  } catch (error) {
    console.error('Error in optionalPermissionTest:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Get user permissions
 * Shows all permissions for the current user
 */
const getUserPermissions = async (req, res) => {
  try {
    const userPermissions = permissionService.getUserPermissions(req.user.role);
    const isAdmin = permissionService.isAdmin(req.user);
    
    res.json({
      success: true,
      message: 'User permissions retrieved successfully',
      data: {
        role: req.user.role,
        isAdmin,
        permissions: userPermissions,
        effectiveRoles: permissionService.getEffectiveRoles(req.user.role)
      },
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in getUserPermissions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Role hierarchy test
 * Shows how role hierarchy works
 */
const roleHierarchyTest = async (req, res) => {
  try {
    const userRole = req.user.role;
    const effectiveRoles = permissionService.getEffectiveRoles(userRole);
    
    // Test different role checks
    const roleTests = {
      isAdmin: permissionService.isAdmin(req.user),
      hasAdminRole: permissionService.hasAnyRole(req.user, ['ADMIN']),
      hasSupervisorRole: permissionService.hasAnyRole(req.user, ['SUPERVISOR']),
      hasMemberRole: permissionService.hasAnyRole(req.user, ['MEMBER']),
      hasAnyAdminRole: permissionService.hasAnyRole(req.user, ['ADMIN', 'DepotAdmin'])
    };
    
    res.json({
      success: true,
      message: 'Role hierarchy test results',
      data: {
        userRole,
        effectiveRoles,
        roleTests,
        explanation: {
          effectiveRoles: 'These are all the roles you inherit based on hierarchy',
          roleTests: 'These show the results of various role checks'
        }
      },
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in roleHierarchyTest:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Test endpoint - Available permissions
 * Shows all available permissions in the system
 */
const getAvailablePermissions = async (req, res) => {
  try {
    const availablePermissions = permissionService.getAvailablePermissions();
    
    res.json({
      success: true,
      message: 'Available permissions in the system',
      data: {
        resources: availablePermissions,
        totalResources: Object.keys(availablePermissions).length,
        note: 'This shows all resources and their available actions defined in the permission system'
      },
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in getAvailablePermissions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  adminOnly,
  readTestResource,
  createTestResource,
  updateTestResource,
  deleteTestResource,
  listTestResources,
  multiplePermissions,
  optionalPermissionTest,
  getUserPermissions,
  roleHierarchyTest,
  getAvailablePermissions
};