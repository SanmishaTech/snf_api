const prisma = require("../config/db");
const validateRequest = require("../utils/validateRequest");
const { z } = require("zod");
const dayjs = require("dayjs");
const fs = require('fs');
const path = require('path');

const getMyAssignedOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Find the delivery partner profile
    const partner = await prisma.deliveryPartner.findUnique({
      where: { userId: parseInt(userId) }
    });

    if (!partner) {
      return res.status(404).json({ errors: { message: "Delivery profile not found" } });
    }

    const today = dayjs().startOf('day').toDate();
    
    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        deliveryPartnerId: partner.id,
        // Optional: you can filter only pending assignments or assignments for today
        // deliveryDate: { gte: today },
      },
      include: {
        snfOrder: { include: { items: true } },
        deliveryScheduleEntry: { include: { deliveryAddress: true, product: true } }
      },
      orderBy: { deliveryDate: "asc" }
    });

    res.json({ assignments });
  } catch (error) {
    next(error);
  }
};

const updateAssignmentStatus = async (req, res, next) => {
  const schema = z.object({
    status: z.enum(["OUT_FOR_DELIVERY", "DELIVERED", "FAILED"]),
    cashCollected: z.string().optional(), // usually comes from form-data as string
    deliveryNotes: z.string().optional(),
  });

  const validationResult = await validateRequest(schema, req.body);
  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  const assignmentId = parseInt(req.params.id);
  const { status, cashCollected, deliveryNotes } = req.body;
  
  let deliveryPhotoUrl = null;
  if (req.file) {
    deliveryPhotoUrl = `/uploads/${req.file.filename}`;
  }

  try {
    const assignment = await prisma.deliveryAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) {
      return res.status(404).json({ errors: { message: "Assignment not found." } });
    }

    // Verify it belongs to the logged in partner
    const partner = await prisma.deliveryPartner.findUnique({ where: { userId: req.user.id } });
    if (!partner || partner.id !== assignment.deliveryPartnerId) {
       return res.status(403).json({ errors: { message: "Unauthorized assignment update." }});
    }

    const payload = {
      status,
      deliveryNotes: deliveryNotes || assignment.deliveryNotes,
    };
    
    if (cashCollected) {
      payload.cashCollected = parseFloat(cashCollected);
    }
    if (deliveryPhotoUrl) {
      payload.deliveryPhotoUrl = deliveryPhotoUrl;
    }

    if (status === "DELIVERED") {
      payload.deliveredAt = new Date();
    } else if (status === "FAILED") {
      payload.failedAt = new Date();
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: payload
    });
    
    // Optionally trigger SNFOrder status update if completed
    if (updated.status === 'DELIVERED') {
      if (updated.snfOrderId) {
        await prisma.sNFOrder.update({
          where: { id: updated.snfOrderId },
          data: { paymentStatus: 'PAID' } // Example. Adjust according to business rules.
        });
      }
      if (updated.deliveryScheduleEntryId) {
         await prisma.deliveryScheduleEntry.update({
           where: { id: updated.deliveryScheduleEntryId },
           data: { status: 'DELIVERED' }
         })
      }
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyAssignedOrders,
  updateAssignmentStatus,
};
