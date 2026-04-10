const prisma = require("../config/db");
const validateRequest = require("../utils/validateRequest");
const { z } = require("zod");
const dayjs = require("dayjs");

const getPendingOrders = async (req, res, next) => {
  try {
    const { depotId, dateStr } = req.query; // dateStr like "2024-05-15"
    if (!depotId) {
      return res.status(400).json({ errors: { message: "depotId required" } });
    }

    let dateFilter = {};
    if (dateStr) {
      const targetDate = dayjs(dateStr);
      dateFilter = {
        gte: targetDate.startOf('day').toDate(),
        lte: targetDate.endOf('day').toDate(),
      };
    }

    // Find SNF direct orders that are not assigned
    const snfOrders = await prisma.sNFOrder.findMany({
      where: {
        depotId: parseInt(depotId),
        ...(dateStr ? { deliveryDate: dateFilter } : {}),
        deliveryAssignment: null, // Only unassigned
      },
      include: {
        items: true,
      },
      orderBy: { deliveryDate: "asc" }
    });

    // Find custom subscription deliveries (DeliveryScheduleEntry) not assigned
    const subEntries = await prisma.deliveryScheduleEntry.findMany({
      where: {
        depotId: parseInt(depotId),
        ...(dateStr ? { deliveryDate: dateFilter } : {}),
        deliveryAssignment: null,
      },
      include: {
        product: true,
        deliveryAddress: true,
      },
      orderBy: { deliveryDate: "asc" }
    });

    res.json({ snfOrders, subEntries });
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
    const { depotId, dateStr } = req.query;
    const whereClause = {};
    if (depotId) whereClause.depotId = parseInt(depotId);

    if (dateStr) {
       const targetDate = dayjs(dateStr);
       whereClause.deliveryDate = {
         gte: targetDate.startOf('day').toDate(),
         lte: targetDate.endOf('day').toDate(),
       };
    }

    const assignments = await prisma.deliveryAssignment.findMany({
      where: whereClause,
      include: {
        deliveryPartner: { select: { firstName: true, lastName: true, mobile: true } },
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

module.exports = {
  getPendingOrders,
  assignOrders,
  getTrackAssignments,
  unassignOrder,
};
