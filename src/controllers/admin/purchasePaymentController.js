const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Prisma Client

/**
 * @desc    Create a Purchase Payment with its details
 * @route   POST /api/admin/purchase-payments
 * @access  Private/Admin
 */
const createPurchasePayment = asyncHandler(async (req, res) => {
  const {
    paymentDate,
    vendorId,
    mode,
    referenceNo,
    notes,
    totalAmount,
    details, // Expecting an array of { purchaseId, amount }
  } = req.body;

  if (!paymentDate || !vendorId || !mode || !totalAmount) {
    res.status(400);
    throw new Error('paymentDate, vendorId, mode and totalAmount are required');
  }

  // Ensure details is parsed JSON if sent as string
  let parsedDetails = [];
  if (details) {
    if (typeof details === 'string') {
      try {
        parsedDetails = JSON.parse(details);
      } catch (err) {
        res.status(400);
        throw new Error('Invalid details format. Should be JSON array');
      }
    } else if (Array.isArray(details)) {
      parsedDetails = details;
    }
  }

  try {
    // Generate payment number: YYYY-xxxxx where x is incremented among existing numbers for this year
    const currentYear = new Date().getFullYear();
    const lastPayment = await prisma.purchasePayment.findFirst({
      where: {
        paymentno: { not: null, startsWith: `${currentYear}-` },
      },
      orderBy: { paymentno: 'desc' },
      select: { paymentno: true },
    });

    let seq = 1;
    if (lastPayment?.paymentno) {
      const prevSeq = parseInt(lastPayment.paymentno.split('-')[1] || '0', 10);
      if (!isNaN(prevSeq)) seq = prevSeq + 1;
    }

    const paymentno = `${currentYear}-${seq.toString().padStart(5, '0')}`;

    const purchasePayment = await prisma.purchasePayment.create({
      data: {
        paymentno,
        paymentDate: new Date(paymentDate),
        vendorId: parseInt(vendorId),
        mode,
        referenceNo: referenceNo || null,
        notes: notes || null,
        totalAmount: parseFloat(totalAmount),
        details: {
          create: parsedDetails.map((d) => ({
            purchaseId: d.purchaseId,
            amount: parseFloat(d.amount),
          })),
        },
      },
      include: { details: true },
    });

    // Update paidAmt for each purchase involved
    const amountMap = {};
    parsedDetails.forEach((d) => {
      const pid = d.purchaseId;
      const amt = parseFloat(d.amount);
      amountMap[pid] = (amountMap[pid] || 0) + amt;
    });

    await Promise.all(
      Object.entries(amountMap).map(([purchaseId, amt]) =>
        prisma.purchase.update({
          where: { id: parseInt(purchaseId) },
          data: {
            paidAmt: {
              increment: amt,
            },
          },
        })
      )
    );

    res.status(201).json(purchasePayment);
  } catch (error) {
    console.error('Error creating purchase payment:', error);
    res.status(500);
    throw new Error('Could not create purchase payment');
  }
});

/**
 * @desc    Get all Purchase Payments (with pagination & search)
 * @route   GET /api/admin/purchase-payments
 * @access  Private/Admin
 */
const getAllPurchasePayments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const vendorId = req.query.vendorId ? parseInt(req.query.vendorId) : null;
  const searchMode = req.query.mode || null; // filter by payment mode

  const whereClause = {};
  if (vendorId) whereClause.vendorId = vendorId;
  if (searchMode) whereClause.mode = searchMode;

  const totalRecords = await prisma.purchasePayment.count({ where: whereClause });
  const totalPages = Math.ceil(totalRecords / limit);

  const payments = await prisma.purchasePayment.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy: { paymentDate: 'desc' },
    include: {
      vendor: true,
      details: true,
    },
  });

  res.status(200).json({
    payments,
    currentPage: page,
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get Purchase Payment by ID
 * @route   GET /api/admin/purchase-payments/:id
 * @access  Private/Admin
 */
const getPurchasePaymentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const payment = await prisma.purchasePayment.findUnique({
    where: { id: parseInt(id) },
    include: {
      vendor: true,
      details: {
        include: {
          purchase: true,
        },
      },
    },
  });

  if (!payment) {
    res.status(404);
    throw new Error('Purchase payment not found');
  }

  res.status(200).json(payment);
});

/**
 * @desc    Update a Purchase Payment
 * @route   PUT /api/admin/purchase-payments/:id
 * @access  Private/Admin
 */
const updatePurchasePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    paymentDate,
    vendorId,
    mode,
    referenceNo,
    notes,
    totalAmount,
    details, // full replace strategy
  } = req.body;

  let parsedDetails = [];
  if (details) {
    if (typeof details === 'string') {
      parsedDetails = JSON.parse(details);
    } else if (Array.isArray(details)) {
      parsedDetails = details;
    }
  }

  try {
    const updatedPayment = await prisma.$transaction(async (tx) => {
      // Update main payment fields
      const payment = await tx.purchasePayment.update({
        where: { id: parseInt(id) },
        data: {
          paymentDate: paymentDate ? new Date(paymentDate) : undefined,
          vendorId: vendorId ? parseInt(vendorId) : undefined,
          mode,
          referenceNo,
          notes,
          totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        },
      });

      if (parsedDetails.length) {
        // Delete existing details and recreate
        await tx.purchasePaymentDetail.deleteMany({ where: { purchasePaymentId: payment.id } });
        await tx.purchasePaymentDetail.createMany({
          data: parsedDetails.map((d) => ({
            purchasePaymentId: payment.id,
            purchaseId: d.purchaseId,
            amount: parseFloat(d.amount),
          })),
        });
      }

      return tx.purchasePayment.findUnique({
        where: { id: payment.id },
        include: { details: true },
      });
    });

    // Recalculate paidAmt for all purchases present in the new details list
    const affectedPurchaseIds = [...new Set(parsedDetails.map((d) => d.purchaseId))];
    await Promise.all(
      affectedPurchaseIds.map(async (pid) => {
        const agg = await prisma.purchasePaymentDetail.aggregate({
          _sum: { amount: true },
          where: { purchaseId: pid },
        });
        await prisma.purchase.update({
          where: { id: pid },
          data: { paidAmt: agg._sum.amount || 0 },
        });
      })
    );

    res.status(200).json(updatedPayment);
  } catch (error) {
    console.error('Error updating purchase payment:', error);
    res.status(500);
    throw new Error('Could not update purchase payment');
  }
});

/**
 * @desc    Delete a Purchase Payment
 * @route   DELETE /api/admin/purchase-payments/:id
 * @access  Private/Admin
 */
const deletePurchasePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      // Get details BEFORE deletion (cascade would remove them afterwards)
      const details = await tx.purchasePaymentDetail.findMany({
        where: { purchasePaymentId: parseInt(id) },
      });

      const amountMap = {};
      details.forEach((d) => {
        amountMap[d.purchaseId] = (amountMap[d.purchaseId] || 0) + parseFloat(d.amount);
      });

      // Decrement paidAmt for each purchase
      await Promise.all(
        Object.entries(amountMap).map(([pid, amt]) =>
          tx.purchase.update({
            where: { id: parseInt(pid) },
            data: {
              paidAmt: {
                decrement: amt,
              },
            },
          })
        )
      );

      // Now delete the payment record (cascade deletes details)
      await tx.purchasePayment.delete({
        where: { id: parseInt(id) },
      });
    });

    // No need for further recalculation; transaction ensured consistency

    res.status(200).json({ message: 'Purchase payment removed successfully' });
  } catch (error) {
    console.error('Error deleting purchase payment:', error);
    res.status(500);
    throw new Error('Could not delete purchase payment');
  }
});

/**
 * @desc    Get Purchases for a Vendor within optional date range
 * @route   GET /api/admin/vendors/:vendorId/purchases
 * @access  Private/Admin
 */
const getVendorPurchases = asyncHandler(async (req, res) => {
  const { vendorId } = req.params;
  const { startDate, endDate } = req.query; // optional yyyy-mm-dd

  const whereClause = {
    vendorId: parseInt(vendorId),
  };
  if (startDate) whereClause.purchaseDate = { gte: new Date(startDate) };
  if (endDate) {
    whereClause.purchaseDate = {
      ...(whereClause.purchaseDate || {}),
      lte: new Date(endDate),
    };
  }

  const purchases = await prisma.purchase.findMany({
    where: whereClause,
    orderBy: { purchaseDate: 'asc' },
    include: {
      details: true,
    },
  });

  res.status(200).json(purchases);
});

module.exports = {
  createPurchasePayment,
  getAllPurchasePayments,
  getPurchasePaymentById,
  updatePurchasePayment,
  deletePurchasePayment,
  getVendorPurchases,
};
