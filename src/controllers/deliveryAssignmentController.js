const prisma = require("../config/db");
const validateRequest = require("../utils/validateRequest");
const { z } = require("zod");
const dayjs = require("dayjs");

const getPendingOrders = async (req, res, next) => {
  try {
    const { depotId, dateStr, page = 1, limit = 50 } = req.query;
    if (!depotId) {
      return res.status(400).json({ errors: { message: "depotId required" } });
    }

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    let dateFilter = {};
    if (dateStr) {
      const targetDate = dayjs(dateStr);
      dateFilter = {
        gte: targetDate.startOf('day').toDate(),
        lte: targetDate.endOf('day').toDate(),
      };
    }

    const whereSNF = {
      depotId: parseInt(depotId),
      ...(dateStr ? { deliveryDate: dateFilter } : {}),
      deliveryAssignment: null,
    };

    const whereSub = {
      depotId: parseInt(depotId),
      ...(dateStr ? { deliveryDate: dateFilter } : {}),
      deliveryAssignment: null,
    };

    // 1. Fetch all pending to filter by wallet
    const snfPending = await prisma.sNFOrder.findMany({
      where: whereSNF,
      include: { items: true, member: { select: { walletBalance: true, strictCodLimit: true } } },
      orderBy: { deliveryDate: "asc" },
    });

    const subPending = await prisma.deliveryScheduleEntry.findMany({
      where: whereSub,
      include: { product: true, deliveryAddress: true, member: { select: { walletBalance: true, strictCodLimit: true } } },
      orderBy: { deliveryDate: "asc" },
    });

    // 2. Fetch Failed Deliveries (Reschedule Pending)
    const failedAssignments = await prisma.deliveryAssignment.findMany({
      where: {
        depotId: parseInt(depotId),
        status: 'NOT_DELIVERED',
      },
      include: {
        snfOrder: { include: { items: true, member: { select: { walletBalance: true, strictCodLimit: true } } } },
        deliveryScheduleEntry: { include: { product: true, deliveryAddress: true, member: { select: { walletBalance: true, strictCodLimit: true } } } },
        deliveryPartner: { select: { firstName: true, lastName: true } }
      }
    });

    const allItems = [
      ...snfPending.map(o => ({ ...o, type: 'SNF', holdReason: null })),
      ...subPending.map(e => ({ ...e, type: 'SUB', holdReason: null }))
    ];

    const processedHolded = [];
    const processedReady = [];

    allItems.forEach(item => {
      const balance = item.member?.walletBalance || 0;
      const isStrict = item.member?.strictCodLimit || false;
      
      if ((isStrict && balance < 0) || balance < -1000) {
        item.holdReason = balance < -1000 ? 'Credit Limit Exceeded' : 'Strict COD Blocked';
        processedHolded.push(item);
      } else {
        processedReady.push(item);
      }
    });

    // Add failed assignments to holded
    failedAssignments.forEach(asgn => {
      const item = asgn.snfOrder ? { ...asgn.snfOrder, type: 'SNF' } : { ...asgn.deliveryScheduleEntry, type: 'SUB' };
      processedHolded.push({
        ...item,
        assignmentId: asgn.id,
        holdReason: 'Failed Delivery (Reschedule Required)',
        failedAt: asgn.failedAt,
        prevPartner: asgn.deliveryPartner ? `${asgn.deliveryPartner.firstName} ${asgn.deliveryPartner.lastName}` : null
      });
    });

    const totalReady = processedReady.length;
    const totalHolded = processedHolded.length;

    res.json({
      orders: processedReady.slice(skip, skip + limitInt),
      holdedOrders: processedHolded.slice(skip, skip + limitInt),
      total: totalReady,
      holdedTotal: totalHolded,
      page: pageInt,
      limit: limitInt
    });
  } catch (error) {
    next(error);
  }
};

const assignOrders = async (req, res, next) => {
  const schema = z.object({
    depotId: z.number().int().positive(),
    deliveryPartnerId: z.number().int().positive(),
    deliveryDate: z.string(), // ISO date string
    snfOrderIds: z.array(z.number().int()).optional(),
    deliveryScheduleEntryIds: z.array(z.number().int()).optional(),
  });

  const validationResult = await validateRequest(schema, req.body);
  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  const { depotId, deliveryPartnerId, deliveryDate, snfOrderIds = [], deliveryScheduleEntryIds = [] } = req.body;

  try {
    const assignments = [];
    const targetDate = dayjs(deliveryDate).toDate();
    // Assuming req.user is populated by auth middleware
    const assignedById = req.user ? req.user.id : null;

    // We can use a transaction
    await prisma.$transaction(async (tx) => {
      for (const orderId of snfOrderIds) {
        const assignment = await tx.deliveryAssignment.create({
          data: {
            depotId,
            deliveryPartnerId,
            deliveryDate: targetDate,
            snfOrderId: orderId,
            assignedById,
            status: "ASSIGNED",
          }
        });
        assignments.push(assignment);
      }

      for (const entryId of deliveryScheduleEntryIds) {
        const assignment = await tx.deliveryAssignment.create({
          data: {
            depotId,
            deliveryPartnerId,
            deliveryDate: targetDate,
            deliveryScheduleEntryId: entryId,
            assignedById,
            status: "ASSIGNED",
          }
        });
        // also mark the entry status as shipped/assigned if needed
        assignments.push(assignment);
      }
    });

    res.status(201).json({ message: "Assigned successfully", count: assignments.length });
  } catch (error) {
    next(error);
  }
};

const getTrackAssignments = async (req, res, next) => {
  try {
    const { depotId, dateStr, status, page = 1, limit = 50 } = req.query;
    const whereClause = {};
    if (depotId) whereClause.depotId = parseInt(depotId);

    if (dateStr) {
      const targetDate = dayjs(dateStr);
      whereClause.deliveryDate = {
        gte: targetDate.startOf('day').toDate(),
        lte: targetDate.endOf('day').toDate(),
      };
    }

    // Count for Assigned + Out For Delivery
    const assignedCount = await prisma.deliveryAssignment.count({
      where: {
        ...whereClause,
        status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] }
      }
    });

    const deliveredCount = await prisma.deliveryAssignment.count({
      where: {
        ...whereClause,
        status: 'DELIVERED'
      }
    });

    const failedCount = await prisma.deliveryAssignment.count({
      where: {
        ...whereClause,
        status: 'NOT_DELIVERED'
      }
    });

    // Pagination
    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    // Filter by status if provided
    if (status) {
      const statusArray = status.split(',');
      whereClause.status = { in: statusArray };
    }

    const total = await prisma.deliveryAssignment.count({ where: whereClause });

    const assignments = await prisma.deliveryAssignment.findMany({
      where: whereClause,
      include: {
        deliveryPartner: { select: { firstName: true, lastName: true, mobile: true } },
        snfOrder: { include: { items: true, member: { select: { walletBalance: true } } } },
        deliveryScheduleEntry: { include: { deliveryAddress: true, product: true, member: { select: { walletBalance: true } } } }
      },
      orderBy: { deliveryDate: "asc" },
      skip: skip,
      take: limitInt
    });

    res.json({
      assignments,
      totals: {
        assigned: assignedCount,
        delivered: deliveredCount,
        failed: failedCount
      },
      total,
      page: pageInt,
      limit: limitInt
    });
  } catch (error) {
    next(error);
  }
};

const unassignOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if the assignment exists and is still in ASSIGNED status
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!assignment) {
      return res.status(404).json({ errors: { message: "Assignment not found" } });
    }

    if (assignment.status !== "ASSIGNED") {
      return res.status(400).json({ errors: { message: "Cannot unassign an order that is already out for delivery or delivered" } });
    }

    await prisma.deliveryAssignment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: "Unassigned successfully" });
  } catch (error) {
    next(error);
  }
};

const retryOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deliveryDate } = req.body;

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!assignment) {
      return res.status(404).json({ errors: { message: "Assignment not found" } });
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id: parseInt(id) },
      data: {
        status: "ASSIGNED",
        deliveryDate: dayjs(deliveryDate).toDate(),
        failedAt: null,
        deliveredAt: null,
        deliveryNotes: null,
        cashCollected: null
      }
    });

    res.json({ message: "Delivery rescheduled successfully", assignment: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingOrders,
  assignOrders,
  getTrackAssignments,
  unassignOrder,
  retryOrder,
};
