const { PrismaClient, DeliveryStatus } = require('@prisma/client');
const walletService = require('../../services/walletService');
const prisma = new PrismaClient();

/**
 * Admin-specific delivery status update with additional business logic
 * Allows admin to change delivery status to special admin-only statuses
 */
const updateDeliveryStatus = async (req, res) => {
  const { id: idString } = req.params;
  const { status, notes } = req.body;
  const id = parseInt(idString, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID format. ID must be an integer.' });
  }

  // Ensure only ADMIN can use this endpoint
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only admin users can use this endpoint.' });
  }

  if (!status || !Object.values(DeliveryStatus).includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${Object.values(DeliveryStatus).join(', ')}` });
  }

  try {
    // Get the full delivery entry with all necessary details
    const deliveryEntry = await prisma.deliveryScheduleEntry.findUnique({
      where: { id: id },
      include: {
        subscription: {
          select: { 
            id: true,
            agencyId: true,
            rate: true,
            qty: true,
            memberId: true,
            member: {
              select: {
                id: true,
                name: true,
                walletBalance: true
              }
            }
          },
        },
        product: {
          select: {
            id: true,
            name: true,
          }
        },
        member: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true
              }
            }
          },
        },
      },
    });

    if (!deliveryEntry) {
      return res.status(404).json({ error: 'Delivery entry not found' });
    }

    // Handle business logic for different status values
    let walletTransaction = null;
    let statusUpdateData = { 
      status: status,
      adminNotes: notes || null
    };
    
    // For admin updates, we can optionally set the agentId if specified in the request
    // This allows admins to assign deliveries to specific agencies
    if (req.body.agentId) {
      statusUpdateData.agentId = parseInt(req.body.agentId, 10);
    }

    switch (status) {
      case 'SKIP_BY_CUSTOMER':
        // Calculate refund amount and credit to wallet
        const refundAmount = walletService.calculateRefundAmount(deliveryEntry);
        
        if (refundAmount > 0) {
          const referenceNumber = `ADMIN_DELIVERY_${deliveryEntry.id}`;
          const transactionNotes = notes ? 
            `Admin: ${notes} - Credit for skipped delivery` : 
            `Credit for skipped delivery - Admin processed - Order ID: ${deliveryEntry.subscription.id}`;
          
          walletTransaction = await walletService.creditWallet(
            deliveryEntry.subscription.memberId,
            refundAmount,
            referenceNumber,
            transactionNotes,
            req.user.id // Admin user who processed this
          );
          
          // Link the wallet transaction to the delivery entry
          if (walletTransaction) {
            statusUpdateData.walletTransactionId = walletTransaction.id;
          }
        }
        break;

      case 'INDRAAI_DELIVERY':
        // Special handling for Indraai delivery
        // Could include notifications, special tracking, etc.
        console.log(`Admin ${req.user.name} marked delivery ${id} as INDRAAI_DELIVERY`);
        break;

      case 'TRANSFER_TO_AGENT':
        // Special handling for agent delivery
        // Could include agent assignment, notifications, etc.
        console.log(`Admin ${req.user.name} marked delivery ${id} as TRANSFER_TO_AGENT`);
        break;

      default:
        // Standard status updates
        break;
    }

    // Update the delivery status
    const updatedDeliveryEntry = await prisma.deliveryScheduleEntry.update({
      where: { id: id },
      data: statusUpdateData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        member: {
          select: {
            id: true,
            name: true,
            walletBalance: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
              }
            }
          },
        },
        deliveryAddress: {
          select: {
            id: true,
            recipientName: true,
            mobile: true,
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            pincode: true,
            city: true,
            state: true,
            label: true,
          },
        },
        subscription: {
          select: {
            id: true,
            agencyId: true,
            rate: true,
            qty: true,
            deliveryInstructions: true,
          },
        },
      }
    });

    // Prepare response with additional information for admin
    const response = {
      ...updatedDeliveryEntry,
      walletTransaction: walletTransaction ? {
        id: walletTransaction.id,
        amount: walletTransaction.amount,
        type: walletTransaction.type,
        status: walletTransaction.status,
        notes: walletTransaction.notes,
        referenceNumber: walletTransaction.referenceNumber,
        createdAt: walletTransaction.createdAt
      } : null,
      adminNotes: notes || null,
      processedBy: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error updating delivery status (Admin):', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Delivery entry not found for update.' });
    }
    
    // Handle wallet service errors
    if (error.message.includes('Failed to credit wallet')) {
      return res.status(500).json({ error: 'Failed to process wallet credit', details: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update delivery status', details: error.message });
  }
};

/**
 * Get delivery entries with admin-specific filters and information
 */
const getDeliveries = async (req, res) => {
  const { 
    date, 
    agencyId, 
    status, 
    memberId, 
    limit = 50, 
    offset = 0 
  } = req.query;

  // Ensure only ADMIN can use this endpoint
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only admin users can use this endpoint.' });
  }

  try {
    const whereClause = {};

    if (date) {
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
      }
      whereClause.deliveryDate = targetDate;
    }

    if (agencyId) {
      whereClause.subscription = {
        ...whereClause.subscription,
        agencyId: parseInt(agencyId, 10)
      };
    }

    if (status) {
      whereClause.status = status;
    }

    if (memberId) {
      whereClause.memberId = parseInt(memberId, 10);
    }

    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: whereClause,
      select: {
        id: true,
        deliveryDate: true,
        quantity: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        member: {
          select: {
            id: true,
            name: true,
            walletBalance: true,
            user: {
              select: {
                id: true,
                name: true,
                mobile: true,
                email: true,
              },
            },
          },
        },
        deliveryAddress: true,
        subscription: {
          select: {
            id: true,
            agencyId: true,
            rate: true,
            qty: true,
            deliverySchedule: true,
            deliveryInstructions: true,
            agency: {
              select: {
                id: true,
                name: true,
              }
            }
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });

    // Get total count for pagination
    const totalCount = await prisma.deliveryScheduleEntry.count({
      where: whereClause,
    });

    res.status(200).json({
      deliveries,
      totalCount,
      hasMore: totalCount > parseInt(offset, 10) + parseInt(limit, 10)
    });

  } catch (error) {
    console.error('Error fetching deliveries (Admin):', error);
    res.status(500).json({ error: 'Failed to fetch deliveries', details: error.message });
  }
};

/**
 * Admin-specific delivery date update
 * Allows admin to change delivery date for a specific delivery entry
 */
const updateDeliveryDate = async (req, res) => {
  const { id: idString } = req.params;
  const { deliveryDate } = req.body;
  const id = parseInt(idString, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID format. ID must be an integer.' });
  }

  // Ensure only ADMIN can use this endpoint
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only admin users can use this endpoint.' });
  }

  if (!deliveryDate) {
    return res.status(400).json({ error: 'deliveryDate is required.' });
  }

  // Validate date format
  const targetDate = new Date(deliveryDate);
  if (isNaN(targetDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
  }

  try {
    // Check if delivery entry exists
    const deliveryEntry = await prisma.deliveryScheduleEntry.findUnique({
      where: { id: id },
      select: {
        id: true,
        deliveryDate: true,
        status: true
      }
    });

    if (!deliveryEntry) {
      return res.status(404).json({ error: 'Delivery entry not found' });
    }

    // Update the delivery date
    const updatedDeliveryEntry = await prisma.deliveryScheduleEntry.update({
      where: { id: id },
      data: {
        deliveryDate: targetDate
      },
      select: {
        id: true,
        deliveryDate: true
      }
    });

    console.log(`Admin ${req.user.name} updated delivery date for entry ${id} to ${deliveryDate}`);

    res.status(200).json({
      id: updatedDeliveryEntry.id,
      deliveryDate: updatedDeliveryEntry.deliveryDate,
      message: 'Delivery date updated successfully'
    });
  } catch (error) {
    console.error('Error updating delivery date (Admin):', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Delivery entry not found for update.' });
    }
    
    res.status(500).json({ error: 'Failed to update delivery date', details: error.message });
  }
};

module.exports = {
  updateDeliveryStatus,
  getDeliveries,
  updateDeliveryDate,
};
