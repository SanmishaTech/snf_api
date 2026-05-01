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

    const filterDate = req.query.date ? dayjs(req.query.date) : dayjs();
    const startOfDay = filterDate.startOf('day').toDate();
    const endOfDay = filterDate.endOf('day').toDate();

    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        deliveryPartnerId: partner.id,
        OR: [
          { status: { not: 'DELIVERED' } },
          {
            status: 'DELIVERED',
            deliveryDate: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        ],
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
    status: z.enum(["OUT_FOR_DELIVERY", "DELIVERED", "NOT_DELIVERED", "FAILED"]),
    cashCollected: z.string().optional(),
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

    const partner = await prisma.deliveryPartner.findUnique({ where: { userId: req.user.id } });
    if (!partner || partner.id !== assignment.deliveryPartnerId) {
      return res.status(403).json({ errors: { message: "Unauthorized assignment update." } });
    }

    const payload = {
      status,
      deliveryNotes: deliveryNotes || assignment.deliveryNotes,
    };

    if (status === 'DELIVERED') {
      payload.deliveredAt = new Date();
      payload.deliveryPhotoUrl = deliveryPhotoUrl;
      if (cashCollected) payload.cashCollected = parseFloat(cashCollected);
    } else if (status === 'NOT_DELIVERED' || status === 'FAILED') {
      payload.failedAt = new Date();
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: payload
    });

    if (updated.status === 'DELIVERED') {
      if (updated.snfOrderId) {
        const order = await prisma.sNFOrder.findUnique({ where: { id: updated.snfOrderId } });
        if (order) {
          const totalAmount = order.totalAmount || 0;
          const collected = updated.cashCollected ? parseFloat(updated.cashCollected.toString()) : 0;
          const deficit = totalAmount - collected;

          if (deficit > 0 && order.memberId) {
            await prisma.member.update({
              where: { id: order.memberId },
              data: { walletBalance: { decrement: deficit } }
            });
            await prisma.walletTransaction.create({
              data: {
                memberId: order.memberId,
                amount: -deficit,
                type: 'DEBIT',
                status: 'PAID',
                notes: `Deficit for Order #${order.orderNo}. Collected: ₹${collected}`
              }
            });
          }
          await prisma.sNFOrder.update({
            where: { id: updated.snfOrderId },
            data: { paymentStatus: 'PAID' }
          });
        }
      }
      if (updated.deliveryScheduleEntryId) {
        await prisma.deliveryScheduleEntry.update({
          where: { id: updated.deliveryScheduleEntryId },
          data: { status: 'DELIVERED' }
        });
      }
    } else if (updated.status === 'NOT_DELIVERED' || updated.status === 'FAILED') {
      if (updated.deliveryScheduleEntryId) {
        await prisma.deliveryScheduleEntry.update({
          where: { id: updated.deliveryScheduleEntryId },
          data: { status: updated.status }
        });
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
