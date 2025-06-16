const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('http-errors');
const { updateVariantStock } = require('../services/variantStockService');

// Helper to generate wastage number like WG-2526-00001 (FY prefix)
async function generateNewWastageNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let fyPrefix;
  if (month >= 3) {
    fyPrefix = `${String(year % 100).padStart(2, '0')}${String((year + 1) % 100).padStart(2, '0')}`;
  } else {
    fyPrefix = `${String((year - 1) % 100).padStart(2, '0')}${String(year % 100).padStart(2, '0')}`;
  }
  const prefix = `${fyPrefix}`;
  const latest = await prisma.wastage.findFirst({
    where: { wastageNo: { startsWith: `${prefix}-` } },
    orderBy: { wastageNo: 'desc' },
    select: { wastageNo: true },
  });
  let next = 1;
  if (latest?.wastageNo) {
    const numPart = latest.wastageNo.split('-').pop();
    const num = parseInt(numPart, 10);
    if (!Number.isNaN(num)) next = num + 1;
  }
  return `${prefix}-${String(next).padStart(5, '0')}`;
}

// Create Wastage
exports.createWastage = async (req, res, next) => {
  const {
    wastageDate,
    invoiceNo,
    invoiceDate,
    vendorId,
    depotId,
    details,
  } = req.body;
  if (!wastageDate || !vendorId || !depotId || !details?.length) {
    return next(
      createError(400, 'wastageDate, vendorId, depotId and at least one detail are required')
    );
  }
  try {
    const wastageNo = await generateNewWastageNo();
    const createdById = req.user?.id || null;
    const created = await prisma.$transaction(async (tx) => {
      const newWastage = await tx.wastage.create({
        data: {
          wastageNo,
          wastageDate: new Date(wastageDate),
          invoiceNo: invoiceNo?.trim() || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          vendorId: parseInt(vendorId, 10),
          depotId: parseInt(depotId, 10),
          createdById,
          details: {
            create: details.map((d) => ({
              productId: parseInt(d.productId, 10),
              variantId: parseInt(d.variantId, 10),
              quantity: parseInt(d.quantity, 10),
            })),
          },
        },
        include: { details: true },
      });

      // Stock ledger entries (issuedQty)
      await tx.stockLedger.createMany({
        data: newWastage.details.map((d) => ({
          productId: d.productId,
          variantId: d.variantId,
          depotId: newWastage.depotId,
          transactionDate: new Date(wastageDate),
          receivedQty: 0,
          issuedQty: d.quantity,
          module: 'wastage',
          foreignKey: newWastage.id,
        })),
      });

      // update variant stocks
      const combos = new Set(
        newWastage.details.map((d) => `${d.productId}-${d.variantId}-${newWastage.depotId}`)
      );
      for (const key of combos) {
        const [pId, vId, dId] = key.split('-').map(Number);
        await updateVariantStock({ productId: pId, variantId: vId, depotId: dId }, tx);
      }
      return newWastage;
    });
    return res.status(201).json(created);
  } catch (err) {
    console.error('[createWastage]', err);
    return next(createError(500, 'Failed to create wastage'));
  }
};

// List Wastages
exports.listWastages = async (req, res, next) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);
  const search = req.query.search || '';
  const where = {};
  if (search) where.wastageNo = { contains: search.toString() };
  try {
    const [records, count] = await prisma.$transaction([
      prisma.wastage.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { depot: true, vendor: true, details: true },
      }),
      prisma.wastage.count({ where }),
    ]);
    res.json({ data: records, totalRecords: count, totalPages: Math.ceil(count / limit), currentPage: page });
  } catch (err) {
    console.error('[listWastages]', err);
    return next(createError(500, 'Failed to fetch wastages'));
  }
};

// Get Wastage by id
exports.getWastage = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const wastage = await prisma.wastage.findUnique({
      where: { id },
      include: { depot: true, details: { include: { product: true, variant: true } } },
    });
    if (!wastage) return next(createError(404, 'Wastage not found'));
    res.json(wastage);
  } catch (err) {
    console.error('[getWastage]', err);
    return next(createError(500, 'Failed to fetch wastage'));
  }
};

// Update Wastage
exports.updateWastage = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const {
    wastageDate,
    invoiceNo,
    invoiceDate,
    vendorId,
    depotId,
    details,
  } = req.body;

  if (!wastageDate || !vendorId || !depotId || !details?.length) {
    return next(
      createError(400, 'wastageDate, vendorId, depotId and details are required')
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const wastage = await tx.wastage.update({
        where: { id },
        data: {
          wastageDate: new Date(wastageDate),
          invoiceNo: invoiceNo?.trim() || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          vendorId: parseInt(vendorId, 10),
          depotId: parseInt(depotId, 10),
          updatedById: req.user?.id || null,
        },
        include: { details: true },
      });

      // delete old details
      await tx.wastageDetail.deleteMany({ where: { wastageId: id } });
      await tx.wastageDetail.createMany({
        data: details.map((d) => ({
          wastageId: id,
          productId: parseInt(d.productId, 10),
          variantId: parseInt(d.variantId, 10),
          quantity: parseInt(d.quantity, 10),
        })),
      });

      // refresh ledger rows
      await tx.stockLedger.deleteMany({ where: { foreignKey: id, module: 'wastage' } });
      if (wastage.depotId) {
        const latestDetails = await tx.wastageDetail.findMany({ where: { wastageId: id } });
        await tx.stockLedger.createMany({
          data: latestDetails.map((d) => ({
            productId: d.productId,
            variantId: d.variantId,
            depotId: wastage.depotId,
            transactionDate: new Date(wastageDate),
            receivedQty: 0,
            issuedQty: d.quantity,
            module: 'wastage',
            foreignKey: id,
          })),
        });

        const combos = new Set(
          latestDetails.map((d) => `${d.productId}-${d.variantId}-${wastage.depotId}`)
        );
        for (const key of combos) {
          const [pId, vId, dId] = key.split('-').map(Number);
          await updateVariantStock({ productId: pId, variantId: vId, depotId: dId }, tx);
        }
      }

      return wastage;
    });
    res.json(updated);
  } catch (err) {
    console.error('[updateWastage]', err);
    next(createError(500, 'Failed to update wastage'));
  }
};

// Delete Wastage
exports.deleteWastage = async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.$transaction(async (tx) => {
      // fetch details & depot before deletion
      const wastage = await tx.wastage.findUnique({
        where: { id },
        include: { details: true },
      });

      if (!wastage) {
        throw new Error('Wastage not found');
      }

      // delete child and parent
      await tx.wastageDetail.deleteMany({ where: { wastageId: id } });
      await tx.wastage.delete({ where: { id } });

      // delete related stock ledger entries
      await tx.stockLedger.deleteMany({ where: { foreignKey: id, module: 'wastage' } });

      // recalc variant stocks
      const combos = new Set(
        wastage.details.map((d) => `${d.productId}-${d.variantId}-${wastage.depotId}`)
      );
      for (const key of combos) {
        const [pId, vId, dId] = key.split('-').map(Number);
        await updateVariantStock({ productId: pId, variantId: vId, depotId: dId }, tx);
      }
    });

    res.json({ message: 'Wastage deleted' });
  } catch (err) {
    console.error('[deleteWastage]', err);
    next(createError(500, 'Failed to delete wastage'));
  }
};
