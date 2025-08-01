const { PrismaClient, DeliveryStatus } = require('@prisma/client');
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

    // Create the where clause with subscription filter
    const whereClause = {
      deliveryDate: targetDate,
      subscription: {
        agencyId: parseInt(agencyIdToQuery, 10),
      },
    };

    // Add payment status filter if specified
    if (paymentStatus === 'PAID') {
      whereClause.subscription.paymentStatus = 'PAID';
    }

    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: whereClause,
      select: {
        id: true,
        deliveryDate: true,
        quantity: true,
        status: true,
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
        subscription: {
          select: {
            id: true,
            period: true,
            deliverySchedule: true,
            deliveryInstructions: true,
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

  if (req.user.role === 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Admin users cannot update delivery status.' });
  }

  // For AGENCY users
  const agencyId = req.user.agencyId;
  if (!agencyId) {
    return res.status(403).json({ error: 'User is not associated with an agency or agencyId not found for status update.' });
  }

  if (!status || !Object.values(DeliveryStatus).includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${Object.values(DeliveryStatus).join(', ')}` });
  }

  console
  try {
    // The ID is an integer, parsed from req.params
    // First, verify the delivery entry belongs to the agency
    const deliveryEntry = await prisma.deliveryScheduleEntry.findUnique({
      where: { id: id }, // Use the parsed integer id
      include: {
        subscription: {
          select: { agencyId: true },
        },
      },
    });

    if (!deliveryEntry) {
      return res.status(404).json({ error: 'Delivery entry not found' });
    }

    if (deliveryEntry.subscription.agencyId !== agencyId) { // agencyId from req.user should already be the correct type (number)
      return res.status(403).json({ error: 'Forbidden: You do not have permission to update this delivery entry.' });
    }

    // Update the status
    const updatedDeliveryEntry = await prisma.deliveryScheduleEntry.update({
      where: { id: id }, // Use the parsed integer id
      data: { status: status },
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

    res.status(200).json(updatedDeliveryEntry);
  } catch (error) {
    console.error('Error updating delivery status:', error);
    // Check for specific Prisma errors if needed, e.g., P2025 (Record to update not found)
    if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Delivery entry not found for update.' });
    }
    res.status(500).json({ error: 'Failed to update delivery status', details: error.message });
  }
};

module.exports = {
  getAgencyDeliveriesByDate,
  updateDeliveryStatus,
};
