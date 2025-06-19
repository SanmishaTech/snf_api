const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const prisma = require('../config/db');

// Helper to parse 'YYYY-MM-DD' or Date object into a JS Date in **local** timezone
function parseLocalDate(dateInput) {
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    // Month in JS Date is 0-indexed
    // use 12:00 noon local time so that when converted/stored in UTC it remains same calendar date
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  // Fallback to default parser
  return new Date(dateInput);
}
// Helper to get financial year string like '2425' from a date
function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0 for January)

  // Financial year starts from April (month 3)
  if (month >= 3) {
    const nextYear = (year + 1).toString().slice(-2);
    return `${year.toString().slice(-2)}${nextYear}`;
  } else {
    const prevYear = (year - 1).toString().slice(-2);
    return `${prevYear}${year.toString().slice(-2)}`;
  }
}

// Helper to generate the next transfer number
async function generateTransferNo(tx, transferDate) {
  const finYear = getFinancialYear(transferDate);
  const prefix = `${finYear}-`;

  const lastTransfer = await tx.transfer.findFirst({
    where: {
      transferNo: {
        startsWith: prefix,
      },
    },
    orderBy: {
      transferNo: 'desc',
    },
    select: {
      transferNo: true,
    },
  });

  let nextSeq = 1;
  if (lastTransfer) {
    const lastSeq = parseInt(lastTransfer.transferNo.split('-')[1], 10);
    nextSeq = lastSeq + 1;
  }

  const newTransferNo = `${prefix}${nextSeq.toString().padStart(6, '0')}`;
  return newTransferNo;
}

const { z } = require('zod');

// ------------------------------
// Validation schemas
// ------------------------------
const transferDetailSchema = z.object({
  fromDepotVariantId: z.coerce.number().int().positive(),
  toDepotVariantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
});

const transferSchema = z.object({
  // transferNo: z.string().min(1), // auto-generated
  transferDate: z.string().or(z.date()),
  fromDepotId: z.coerce.number().int().positive(),
  toDepotId: z.coerce.number().int().positive(),
  notes: z.string().or(z.literal('')).optional(),
  details: z.array(transferDetailSchema).min(1),
});

// ------------------------------
// POST /api/transfers  -> create a stock transfer
// ------------------------------
exports.createTransfer = asyncHandler(async (req, res, next) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(createError(400, parsed.error.errors.map((e) => e.message).join(', ')));
  }

  const { transferDate, fromDepotId, toDepotId, notes, details } = parsed.data;

  if (fromDepotId === toDepotId) {
    return next(createError(400, 'From and To depots cannot be the same.'));
  }


  const newTransfer = await prisma.$transaction(async (tx) => {
    const parsedDate = parseLocalDate(transferDate);
    const transferNo = await generateTransferNo(tx, parsedDate);

    // 1. Create Transfer header
    const transfer = await tx.transfer.create({
      data: {
        transferNo,
        transferDate: parsedDate,
        fromDepotId,
        toDepotId,
        notes,
        createdById: req.user?.id,
      },
    });

    for (const item of details) {
      // 2. Validate variants
      const [fromVariant, toVariant] = await Promise.all([
        tx.depotProductVariant.findUnique({ where: { id: item.fromDepotVariantId } }),
        tx.depotProductVariant.findUnique({ where: { id: item.toDepotVariantId } }),
      ]);

      if (!fromVariant || !toVariant) throw createError(404, 'Variant not found');
      if (fromVariant.depotId !== fromDepotId) throw createError(400, `Variant ${fromVariant.name} does not belong to the source depot.`);
      if (toVariant.depotId !== toDepotId) throw createError(400, `Variant ${toVariant.name} does not belong to the destination depot.`);
      if (fromVariant.productId !== toVariant.productId) throw createError(400, 'Product mismatch between variants.');
      if (fromVariant.closingQty < item.quantity) throw createError(400, `Insufficient stock for ${fromVariant.name}.`);

      // 3. Create TransferDetail
      await tx.transferDetail.create({
        data: {
          transferId: transfer.id,
          fromDepotVariantId: item.fromDepotVariantId,
          toDepotVariantId: item.toDepotVariantId,
          quantity: item.quantity,
        },
      });

      // 4. Update stock quantities
      await Promise.all([
        tx.depotProductVariant.update({ where: { id: fromVariant.id }, data: { closingQty: { decrement: item.quantity } } }),
        tx.depotProductVariant.update({ where: { id: toVariant.id }, data: { closingQty: { increment: item.quantity } } }),
      ]);

      // 5. Create Ledger entries
      await tx.stockLedger.createMany({
        data: [
          { // Issue from source
            productId: fromVariant.productId,
            variantId: fromVariant.id,
            depotId: fromDepotId,
            transactionDate: parseLocalDate(transferDate),
            issuedQty: item.quantity,
            module: 'transfer',
            foreignKey: transfer.id,
          },
          { // Receive at destination
            productId: toVariant.productId,
            variantId: toVariant.id,
            depotId: toDepotId,
            transactionDate: parseLocalDate(transferDate),
            receivedQty: item.quantity,
            module: 'transfer',
            foreignKey: transfer.id,
          },
        ],
      });
    }
    return transfer;
  });

  res.status(201).json({ message: 'Transfer completed successfully', data: newTransfer });
});


// ------------------------------
// GET /api/transfers  -> list all transfers
// ------------------------------
exports.getTransfers = asyncHandler(async (req, res, next) => {
  const { page = 1, pageSize = 10, searchTerm } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
  const take = parseInt(pageSize, 10);

  const where = searchTerm
    ? {
        OR: [
          { transferNo: { contains: searchTerm } },
          { fromDepot: { name: { contains: searchTerm } } },
          { toDepot: { name: { contains: searchTerm } } },
        ],
      }
    : {};

  const [transfers, total] = await prisma.$transaction([
    prisma.transfer.findMany({
      where,
      skip,
      take,
      orderBy: { transferDate: 'desc' },
      include: {
        fromDepot: { select: { name: true } },
        toDepot: { select: { name: true } },
        details: { select: { quantity: true } },
      },
    }),
    prisma.transfer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take);

  res.json({ 
    data: transfers,
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
    total,
    totalPages,
  });
});

// ------------------------------
// GET /api/transfers/:id  -> get single transfer
// ------------------------------
exports.getTransfer = asyncHandler(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return next(createError(400, 'Invalid transfer id'));
  try {
    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: {
        fromDepot: { select: { name: true } },
        toDepot: { select: { name: true } },
        details: true,
      },
    });
    if (!transfer) throw createError(404, 'Transfer not found');
    res.json({ data: transfer });
  } catch (err) {
    next(err);
  }
});

// ------------------------------
// PUT /api/transfers/:id  -> update a stock transfer
// ------------------------------
exports.updateTransfer = asyncHandler(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return next(createError(400, 'Invalid transfer id'));

  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(createError(400, parsed.error.errors.map((e) => e.message).join(', ')));
  }
  const { transferDate, fromDepotId, toDepotId, notes, details } = parsed.data;

  if (fromDepotId === toDepotId) {
    return next(createError(400, 'From and To depots cannot be the same.'));
  }

  try {
    const updatedTransfer = await prisma.$transaction(async (tx) => {
      // fetch existing with details first
      const existing = await tx.transfer.findUnique({
        where: { id },
        include: { details: true },
      });
      if (!existing) throw createError(404, 'Transfer not found');

      // 1. Rollback stock & ledger effects of existing details
      for (const d of existing.details) {
        await tx.depotProductVariant.update({
          where: { id: d.fromDepotVariantId },
          data: { closingQty: { increment: d.quantity } },
        });
        await tx.depotProductVariant.update({
          where: { id: d.toDepotVariantId },
          data: { closingQty: { decrement: d.quantity } },
        });
      }
      await tx.stockLedger.deleteMany({ where: { module: 'transfer', foreignKey: id } });
      await tx.transferDetail.deleteMany({ where: { transferId: id } });

      // 2. Update header
      const transfer = await tx.transfer.update({
        where: { id },
        data: {
          // transferNo, // should not be updatable
          transferDate: parseLocalDate(transferDate),
          fromDepotId,
          toDepotId,
          notes,
          updatedAt: new Date(),
        },
      });

      // 3. Apply new details
      for (const item of details) {
        const [fromVariant, toVariant] = await Promise.all([
          tx.depotProductVariant.findUnique({ where: { id: item.fromDepotVariantId } }),
          tx.depotProductVariant.findUnique({ where: { id: item.toDepotVariantId } }),
        ]);
        if (!fromVariant || !toVariant) throw createError(404, 'Variant not found');
        if (fromVariant.depotId !== fromDepotId) throw createError(400, `Variant ${fromVariant.name} does not belong to the source depot.`);
        if (toVariant.depotId !== toDepotId) throw createError(400, `Variant ${toVariant.name} does not belong to the destination depot.`);
        if (fromVariant.productId !== toVariant.productId) throw createError(400, 'Product mismatch between variants.');
        if (fromVariant.closingQty < item.quantity) throw createError(400, `Insufficient stock for ${fromVariant.name}.`);

        await tx.transferDetail.create({
          data: {
            transferId: transfer.id,
            fromDepotVariantId: item.fromDepotVariantId,
            toDepotVariantId: item.toDepotVariantId,
            quantity: item.quantity,
          },
        });
        await Promise.all([
          tx.depotProductVariant.update({ where: { id: fromVariant.id }, data: { closingQty: { decrement: item.quantity } } }),
          tx.depotProductVariant.update({ where: { id: toVariant.id }, data: { closingQty: { increment: item.quantity } } }),
        ]);
        await tx.stockLedger.createMany({
          data: [
            {
              productId: fromVariant.productId,
              variantId: fromVariant.id,
              depotId: fromDepotId,
              transactionDate: parseLocalDate(transferDate),
              issuedQty: item.quantity,
              module: 'transfer',
              foreignKey: transfer.id,
            },
            {
              productId: toVariant.productId,
              variantId: toVariant.id,
              depotId: toDepotId,
              transactionDate: parseLocalDate(transferDate),
              receivedQty: item.quantity,
              module: 'transfer',
              foreignKey: transfer.id,
            },
          ],
        });
      }
      return transfer;
    });

    res.json({ message: 'Transfer updated successfully', data: updatedTransfer });
  } catch (err) {
    console.error('[updateTransfer]', err);
    next(err);
  }
});

// ------------------------------
// DELETE /api/transfers/:id  -> delete a stock transfer
// ------------------------------
exports.deleteTransfer = asyncHandler(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return next(createError(400, 'Invalid transfer id'));

  try {
    await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id },
        include: { details: true },
      });
      if (!transfer) throw createError(404, 'Transfer not found');

      for (const d of transfer.details) {
        await tx.depotProductVariant.update({ where: { id: d.fromDepotVariantId }, data: { closingQty: { increment: d.quantity } } });
        await tx.depotProductVariant.update({ where: { id: d.toDepotVariantId }, data: { closingQty: { decrement: d.quantity } } });
      }
      await tx.stockLedger.deleteMany({ where: { module: 'transfer', foreignKey: id } });
      await tx.transferDetail.deleteMany({ where: { transferId: id } });
      await tx.transfer.delete({ where: { id } });
    });

    res.json({ message: 'Transfer deleted successfully' });
  } catch (err) {
    console.error('[deleteTransfer]', err);
    next(err);
  }
});
