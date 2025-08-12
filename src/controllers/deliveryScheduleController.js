const { PrismaClient, DeliveryStatus } = require('@prisma/client');
const walletService = require('../services/walletService');
const prisma = new PrismaClient();

// Get all delivery schedule entries for a specific agency on a given date
const getAgencyDeliveriesByDate = async (req, res) => {
  const { date, paymentStatus } = req.query;
  let agencyIdToQuery;

  if (req.user.role === 'ADMIN') {
    agencyIdToQuery = req.query.agencyId;
    if (!agencyIdToQuery) {
      // For ADMIN, if no agencyId is selected, return empty array or a specific message.
      // It's better for the frontend to control this and not call if no agency is selected.
      // However, if called, we can return empty or an error.
      // Let's return an empty array to avoid breaking the frontend if it calls without an agencyId initially.
      return res.status(200).json([]); 
      // Alternative: return res.status(400).json({ error: 'agencyId query parameter is required for admin users.' });
    }
  } else if (req.user.role === 'AGENCY') {
    agencyIdToQuery = req.user.agencyId;
    if (!agencyIdToQuery) {
      return res.status(403).json({ error: 'User is not associated with an agency or agencyId not found.' });
    }
  } else {
    return res.status(403).json({ error: 'User role not permitted to access this resource.' });
  }

  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  try {
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
    }

    // Adjust date to cover the entire day from start to end in UTC
    // Prisma stores DateTime in UTC. If deliveryDate is @db.Date, it's stored as YYYY-MM-DD 00:00:00 UTC.
    // So, a direct comparison with targetDate (which will also be YYYY-MM-DD 00:00:00 UTC if created from string) should work.

    // Create the where clause to include deliveries where:
    // 1. The subscription belongs to this agency (original logic)
    // 2. OR the delivery was handled by this agency (agentId)
    const whereClause = {
      deliveryDate: targetDate,
      OR: [
        {
          subscription: {
            agencyId: parseInt(agencyIdToQuery, 10),
          },
        },
        {
          agentId: parseInt(agencyIdToQuery, 10),
        }
      ]
    };

    // Add payment status filter if specified
    if (paymentStatus === 'PAID') {
      // Apply payment status filter to both OR conditions
      whereClause.OR[0].subscription.paymentStatus = 'PAID';
      // For agentId-based deliveries, we still need to check subscription payment status
      whereClause.OR[1].subscription = {
        paymentStatus: 'PAID'
      };
    }

    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: whereClause,
      select: {
        id: true,
        deliveryDate: true,
        quantity: true,
        status: true,
        agentId: true,
        adminNotes: true,
        walletTransaction: {
          select: {
            id: true,
            amount: true,
            type: true,
            status: true,
            notes: true,
            referenceNumber: true,
            createdAt: true,
          },
        },
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
            user: {
              select: {
                id: true,
                name: true,
                mobile: true,
              },
            },
          },
        },
        deliveryAddress: true,
        DepotProductVariant: {
          select: {
            id: true,
            name: true,
            hsnCode: true,
          },
        },
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
        subscription: {
          select: {
            id: true,
            period: true,
            deliverySchedule: true,
            deliveryInstructions: true,
            agencyId: true,
            agency: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!deliveries) {
      return res.status(404).json({ message: 'No deliveries found for this agency on the specified date.' });
    }

    // Debug: Log the first delivery to check DepotProductVariant
    if (deliveries.length > 0) {
      console.log('First delivery item:', JSON.stringify(deliveries[0], null, 2));
      console.log('DepotProductVariant in first item:', deliveries[0].DepotProductVariant);
    }

    res.status(200).json(deliveries);
  } catch (error) {
    console.error('Error fetching agency deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch agency deliveries', details: error.message });
  }
};

// Update the status of a delivery schedule entry
const updateDeliveryStatus = async (req, res) => {
  const { id: idString } = req.params;
  const { status } = req.body;
  const id = parseInt(idString, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID format. ID must be an integer.' });
  }

  // Check user permissions - Allow both ADMIN and AGENCY to update delivery status
  if (!['ADMIN', 'AGENCY'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: User role not permitted to update delivery status.' });
  }

  // For AGENCY users, validate agency association
  if (req.user.role === 'AGENCY') {
    const agencyId = req.user.agencyId;
    if (!agencyId) {
      return res.status(403).json({ error: 'User is not associated with an agency or agencyId not found for status update.' });
    }
  }

  if (!status || !Object.values(DeliveryStatus).includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${Object.values(DeliveryStatus).join(', ')}` });
  }

  try {
    // First, get the full delivery entry with subscription details for business logic
    const deliveryEntry = await prisma.deliveryScheduleEntry.findUnique({
      where: { id: id },
      include: {
        subscription: {
          select: { 
            id: true,
            agencyId: true,
            rate: true,
            qty: true,
            memberId: true
          },
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

    // For AGENCY users, verify they can update this delivery
    if (req.user.role === 'AGENCY' && deliveryEntry.subscription.agencyId !== req.user.agencyId) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to update this delivery entry.' });
    }

    // Handle business logic for different status values
    let walletTransaction = null;
    if (status === 'SKIP_BY_CUSTOMER') {
      // Calculate refund amount and credit to wallet
      const refundAmount = walletService.calculateRefundAmount(deliveryEntry);
      
      if (refundAmount > 0) {
        const referenceNumber = `DELIVERY_${deliveryEntry.id}`;
        const notes = `Credit for skipped delivery - Order ID: ${deliveryEntry.subscription.id}, Product: ${deliveryEntry.product?.name || 'Product'}`;
        
        walletTransaction = await walletService.creditWallet(
          deliveryEntry.subscription.memberId,
          refundAmount,
          referenceNumber,
          notes,
          req.user.id // Admin/Agency user who processed this
        );
      }
    }

    // Prepare update data
    const updateData = { status: status };
    
    // If this is an agency user updating the status, set them as the agent who handled it
    if (req.user.role === 'AGENCY' && req.user.agencyId) {
      updateData.agentId = req.user.agencyId;
    }

    // Update the delivery status
    const updatedDeliveryEntry = await prisma.deliveryScheduleEntry.update({
      where: { id: id },
      data: updateData,
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
            user: {
              select: {
                id: true,
                name: true,
                email: true,
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
      }
    });

    // Include wallet transaction info in response if applicable
    const response = {
      ...updatedDeliveryEntry,
      walletTransaction: walletTransaction ? {
        id: walletTransaction.id,
        amount: walletTransaction.amount,
        type: walletTransaction.type,
        status: walletTransaction.status,
        notes: walletTransaction.notes
      } : null
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error updating delivery status:', error);
    
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

module.exports = {
  getAgencyDeliveriesByDate,
  updateDeliveryStatus,
};
