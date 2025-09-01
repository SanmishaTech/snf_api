const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('http-errors');
const { updateVariantStock } = require('../services/variantStockService');

// Helper to generate purchase number like 2526-00001 (financial year prefix)
async function generateNewPurchaseNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  let fyPrefix;
  if (month >= 3) {
    // April-Dec → current FY e.g. 2025-26 => "2526"
    fyPrefix = `${String(year % 100).padStart(2, '0')}${String((year + 1) % 100).padStart(2, '0')}`;
  } else {
    // Jan-Mar → previous FY
    fyPrefix = `${String((year - 1) % 100).padStart(2, '0')}${String(year % 100).padStart(2, '0')}`;
  }

  const latest = await prisma.purchase.findFirst({
    where: { purchaseNo: { startsWith: `${fyPrefix}-` } },
    orderBy: { purchaseNo: 'desc' },
    select: { purchaseNo: true },
  });
  let next = 1;
  if (latest?.purchaseNo) {
    const num = parseInt(latest.purchaseNo.split('-')[1], 10);
    if (!Number.isNaN(num)) next = num + 1;
  }
  return `${fyPrefix}-${String(next).padStart(5, '0')}`;
}

// Create Purchase
exports.createPurchase = async (req, res, next) => {
  const {
    purchaseDate,
    invoiceNo,
    invoiceDate,
    vendorId,
    depotId,
    details: rawDetails, // backend clients may send `details`
    purchaseDetails,     // frontend currently sends `purchaseDetails`
  } = req.body;

  const details = rawDetails || purchaseDetails;

  if (!purchaseDate || !vendorId || !details?.length) {
    return next(createError(400, 'purchaseDate, vendorId and at least one detail item are required.'));
  }

  try {
    const purchaseNo = await generateNewPurchaseNo();
    const createdById = req.user?.id || null; // assuming auth middleware sets req.user

    const result = await prisma.$transaction(async (tx) => {
      // 1. create purchase with nested details
      const newPurchase = await tx.purchase.create({
        data: {
          purchaseNo,
          purchaseDate: new Date(purchaseDate),
          invoiceNo: invoiceNo?.trim() || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          vendorId: parseInt(vendorId, 10),
          depotId: depotId ? parseInt(depotId, 10) : null,
          createdById,
          details: {
            create: details.map((d) => ({
              productId: parseInt(d.productId, 10),
              variantId: parseInt(d.variantId, 10),
              quantity: parseInt(d.quantity, 10),
              purchaseRate: parseFloat(d.purchaseRate),
            })),
          },
        },
        include: { details: true },
      });

      // 2. create stock ledger entries for each detail
      //    Skip if depotId is not provided (ledger requires depotId)
      if (newPurchase.depotId) {
        await tx.stockLedger.createMany({
          data: newPurchase.details.map((d) => ({
            productId: d.productId,
            variantId: d.variantId,
            depotId: newPurchase.depotId,
            transactionDate: new Date(purchaseDate),
            receivedQty: d.quantity,
            issuedQty: 0,
            module: 'purchase',
            foreignKey: newPurchase.id,
          })),
        });

        // update variant stocks and migrate to depot-specific variant ids
        const combos = new Set(
          newPurchase.details.map((d) => `${d.productId}-${d.variantId}-${newPurchase.depotId}`)
        );
        for (const key of combos) {
          const [pId, vId, dId] = key.split('-').map(Number);
          // Re-calculate stock, and get / create the depotProductVariant id
          const depotVariantId = await updateVariantStock({ productId: pId, variantId: vId, depotId: dId }, tx);

          if (depotVariantId) {
            // Align stock ledger rows to point to the depot variant row
            await tx.stockLedger.updateMany({
              where: {
                foreignKey: newPurchase.id,
                module: 'purchase',
                productId: pId,
                variantId: vId,
                depotId: dId,
              },
              data: { variantId: depotVariantId },
            });

            // Align purchaseDetail rows as well
            await tx.purchaseDetail.updateMany({
              where: {
                purchaseId: newPurchase.id,
                productId: pId,
                variantId: vId,
              },
              data: { variantId: depotVariantId },
            });
          }
        }
      }

      return newPurchase;
    });

    return res.status(201).json({ ...result, purchaseDetails: result.details });
  } catch (err) {
    console.error('[createPurchase]', err);
    return next(createError(500, err.message || 'Failed to create purchase'));
  }
};

// List Purchases with pagination & search
exports.listPurchases = async (req, res, next) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);
  const search = req.query.search || '';
  const date = req.query.date || '';
  const vendorId = req.query.vendorId ? parseInt(req.query.vendorId, 10) : null;
  const depotId = req.query.depotId ? parseInt(req.query.depotId, 10) : null;
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';

  // Build dynamic filters ---------------------------------------------------
  const filters = [];
  
  // Get current user for role-based filtering
  const currentUser = req.user;

  // Search filter (purchaseNo or vendor name)
  if (search) {
    filters.push({
      OR: [
        { purchaseNo: { contains: search } },
        {
          vendor: {
            is: {
              name: { contains: search },
            },
          },
        },
      ],
    });
  }

  // Date filter (match purchaseDate on the same day)
  if (date) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    filters.push({ purchaseDate: { gte: start, lte: end } });
  }
  
  // Date range filters (startDate and endDate)
  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      dateFilter.gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    filters.push({ purchaseDate: dateFilter });
  }
  
  // Vendor filter (from query params - only apply for non-VENDOR users)
  // VENDOR users will have their vendorId auto-detected in role-based filters below
  if (vendorId && !isNaN(vendorId) && currentUser?.role !== 'VENDOR') {
    filters.push({ vendorId });
  }
  
  // Depot filter (from query params - will be overridden by role-based filters if user is DepotAdmin)
  if (depotId && !isNaN(depotId)) {
    filters.push({ depotId });
  }

  // Role-based scope filters
  
  // Depot scope filter for DepotAdmin - Handle multiple role formats
  const userRole = currentUser?.role?.toUpperCase();
  const isDepotUser = userRole === 'DEPOTADMIN' || userRole === 'DEPOT_ADMIN' || userRole?.includes('DEPOT');
  
  if (isDepotUser && currentUser.depotId) {
    filters.push({ depotId: currentUser.depotId });
    console.log(`[listPurchases] Applying depot filter for user role: ${currentUser.role}, depotId: ${currentUser.depotId}`);
  }
  
  // Vendor scope filter for VENDOR role users
  if (currentUser?.role === 'VENDOR') {
    // Find the vendor record associated with this user
    const vendor = await prisma.vendor.findUnique({
      where: { userId: currentUser.id },
      select: { id: true }
    });
    
    if (vendor) {
      filters.push({ vendorId: vendor.id });
    } else {
      // If no vendor record found for VENDOR role user, return empty results
      return res.json({
        totalPages: 0,
        totalRecords: 0,
        currentPage: page,
        data: []
      });
    }
  }

  const where = filters.length > 0 ? { AND: filters } : undefined;

  try {
    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          vendor: { select: { id: true, name: true } },
          depot: { select: { id: true, name: true } },
          details: true,
        },
      }),
    ]);

    // Rename `details` -> `purchaseDetails` for frontend consistency
    const formatted = purchases.map((p) => ({
      ...p,
      purchaseDetails: p.details,
      paidAmt: p.paidAmt ?? 0,
    }));

    return res.json({
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      currentPage: page,
      data: formatted,
    });
  } catch (err) {
    console.error('[listPurchases]', err);
    return next(createError(500, 'Failed to fetch purchases'));
  }
};

// Get Purchase by ID
exports.getPurchase = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        vendor: true,
        depot: true,
        details: {
          include: { product: true, variant: true },
        },
      },
    });
    if (!purchase) return next(createError(404, 'Purchase not found'));

    const formatted = { ...purchase, purchaseDetails: purchase.details };
    return res.json(formatted);
  } catch (err) {
    console.error('[getPurchase]', err);
    return next(createError(500, 'Failed to fetch purchase'));
  }
};

// Update Purchase
exports.updatePurchase = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const {
    purchaseDate,
    invoiceNo,
    invoiceDate,
    vendorId,
    depotId,
    details: rawDetails,
    purchaseDetails,
  } = req.body;

  const details = rawDetails || purchaseDetails;

  if (!purchaseDate || !vendorId || !details?.length) {
    return next(createError(400, 'purchaseDate, vendorId and details are required'));
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.update({
        where: { id },
        data: {
          purchaseDate: new Date(purchaseDate),
          invoiceNo: invoiceNo?.trim() || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          vendorId: parseInt(vendorId, 10),
          depotId: depotId ? parseInt(depotId, 10) : null,
          updatedById: req.user?.id || null,
        },
        include: { details: true },
      });
      // Delete existing details, then recreate (simple approach)
      await tx.purchaseDetail.deleteMany({ where: { purchaseId: id } });
      await tx.purchaseDetail.createMany({
        data: details.map((d) => ({
          purchaseId: id,
          productId: parseInt(d.productId, 10),
          variantId: parseInt(d.variantId, 10),
          quantity: parseInt(d.quantity, 10),
          purchaseRate: parseFloat(d.purchaseRate),
        })),
      });

      // Remove previous ledger rows for this purchase
      await tx.stockLedger.deleteMany({ where: { foreignKey: id, module: 'purchase' } });

      // Add fresh ledger rows if depotId is provided
      if (purchase.depotId) {
        // Need fresh details list (created above). Fetch quickly
        const latestDetails = await tx.purchaseDetail.findMany({ where: { purchaseId: id } });
        await tx.stockLedger.createMany({
          data: latestDetails.map((d) => ({
            productId: d.productId,
            variantId: d.variantId,
            depotId: purchase.depotId,
            transactionDate: new Date(purchaseDate),
            receivedQty: d.quantity,
            issuedQty: 0,
            module: 'purchase',
            foreignKey: purchase.id,
          })),
        });

        // update variant stocks
        const combos = new Set(
          latestDetails.map((d) => `${d.productId}-${d.variantId}-${purchase.depotId}`)
        );
        for (const key of combos) {
          const [pId, vId, dId] = key.split('-').map(Number);
          const depotVariantId = await updateVariantStock({ productId: pId, variantId: vId, depotId: dId }, tx);

          if (depotVariantId) {
            await tx.stockLedger.updateMany({
              where: {
                foreignKey: purchase.id,
                module: 'purchase',
                productId: pId,
                variantId: vId,
                depotId: dId,
              },
              data: { variantId: depotVariantId },
            });

            await tx.purchaseDetail.updateMany({
              where: {
                purchaseId: purchase.id,
                productId: pId,
                variantId: vId,
              },
              data: { variantId: depotVariantId },
            });
          }
        }
      }

      return purchase;
    });
    return res.json({ ...updated, purchaseDetails: updated.details });
  } catch (err) {
    console.error('[updatePurchase]', err);
    return next(createError(500, 'Failed to update purchase'));
  }
};

// Delete Purchase
exports.deletePurchase = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.$transaction(async (tx) => {
      // fetch details & depot before deletion for stock recalculation
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { details: true },
      });

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      // delete dependent payment details first to avoid FK constraints
      await tx.purchasePaymentDetail.deleteMany({ where: { purchaseId: id } });
      // if any purchasePayment rows directly reference this purchase, detach them (or delete as per business logic)
      await tx.purchasePayment.updateMany({ where: { purchaseId: id }, data: { purchaseId: null } });

      // delete child purchase detail rows
      await tx.purchaseDetail.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });

      // delete related stock ledger entries
      await tx.stockLedger.deleteMany({ where: { foreignKey: id, module: 'purchase' } });

      // recalc variant stocks for affected combos
      const combos = new Set(
        purchase.details.map((d) => `${d.productId}-${d.variantId}-${purchase.depotId}`)
      );
      for (const key of combos) {
        const [pId, vId, dId] = key.split('-').map(Number);
        await updateVariantStock({ productId: pId, variantId: vId, depotId: dId }, tx);
      }
    });

    return res.json({ message: 'Purchase deleted' });
  } catch (err) {
    console.error('[deletePurchase]', err);
    return next(createError(500, 'Failed to delete purchase'));
  }
};
