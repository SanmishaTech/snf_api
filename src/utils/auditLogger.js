const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Log an audit event for SNF order changes
 * @param {Object} params - Audit log parameters
 * @param {number} params.orderId - SNF Order ID
 * @param {number} params.userId - User who made the change
 * @param {string} params.action - Action type (e.g., 'ITEM_ADDED', 'DELIVERY_DATE_UPDATED')
 * @param {string} params.description - Human-readable description
 * @param {Object} params.oldValue - Previous values (will be JSON stringified)
 * @param {Object} params.newValue - New values (will be JSON stringified)
 */
const logSNFOrderChange = async ({ orderId, userId, action, description, oldValue = null, newValue = null }) => {
  try {
    await prisma.sNFOrderAuditLog.create({
      data: {
        orderId,
        userId,
        action,
        description,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
      },
    });
  } catch (error) {
    console.error('Failed to log SNF order audit event:', error);
    // Don't throw - audit logging should not break the main operation
  }
};

/**
 * Get audit logs for a specific SNF order
 * @param {number} orderId - SNF Order ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of logs to return
 * @param {number} options.offset - Number of logs to skip
 * @returns {Promise<Array>} Array of audit log entries with user details
 */
const getSNFOrderAuditLogs = async (orderId, { limit = 50, offset = 0 } = {}) => {
  try {
    const logs = await prisma.sNFOrderAuditLog.findMany({
      where: { orderId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      description: log.description,
      oldValue: log.oldValue ? JSON.parse(log.oldValue) : null,
      newValue: log.newValue ? JSON.parse(log.newValue) : null,
      createdAt: log.createdAt,
      user: log.user,
    }));
  } catch (error) {
    console.error('Failed to fetch SNF order audit logs:', error);
    throw error;
  }
};

module.exports = {
  logSNFOrderChange,
  getSNFOrderAuditLogs,
};
