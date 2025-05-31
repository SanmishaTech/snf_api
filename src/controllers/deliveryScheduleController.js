const { PrismaClient, DeliveryStatus } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all delivery schedule entries for a specific agency on a given date
const getAgencyDeliveriesByDate = async (req, res) => {
  const { date } = req.query;
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

    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: {
        deliveryDate: targetDate,
        subscription: {
          agencyId: parseInt(agencyIdToQuery, 10),
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            unit: true,
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
        subscription: {
            select: {
                id: true,
                // any other subscription details if needed by frontend
            }
        }
      },
      orderBy: {
        createdAt: 'asc', // Or any other preferred order
      },
    });

    if (!deliveries) {
      return res.status(404).json({ message: 'No deliveries found for this agency on the specified date.' });
    }

    res.status(200).json(deliveries);
  } catch (error) {
    console.error('Error fetching agency deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch agency deliveries', details: error.message });
  }
};

// Update the status of a delivery schedule entry
const updateDeliveryStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

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

  try {
    // The ID is a CUID string, no need to parse as Int
    // First, verify the delivery entry belongs to the agency
    const deliveryEntry = await prisma.deliveryScheduleEntry.findUnique({
      where: { id: id }, // Use the id string directly
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
      where: { id: id }, // Use the id string directly
      data: { status: status }, 
      include: {
        product: {
          select: {
            id: true,
            name: true,
            unit: true,
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
