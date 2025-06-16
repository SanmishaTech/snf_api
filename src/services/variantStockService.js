const prismaClient = require('../config/db');

/**
 * Recalculate and upsert VariantStock for a given product / variant / depot
 * @param {Object} params
 * @param {number} params.productId
 * @param {number} params.variantId
 * @param {number} params.depotId
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} [prismaCtx]
 * @returns {Promise<number|null>} DepotProductVariant id or null if variant missing
 */
async function updateVariantStock({ productId, variantId, depotId }, prismaCtx = prismaClient) {
  // Aggregate received & issued from stock ledger
  const agg = await prismaCtx.stockLedger.aggregate({
    where: { productId, variantId, depotId },
    _sum: {
      receivedQty: true,
      issuedQty: true,
    },
  });

  const received = agg._sum.receivedQty || 0;
  const issued = agg._sum.issuedQty || 0;
  const closing = received - issued;

  // First try treating `variantId` as a DepotProductVariant id (newer flow)
  const depotVariant = await prismaCtx.depotProductVariant.findUnique({ where: { id: variantId } });

  if (depotVariant) {
    // Simple case – row already exists, just update closingQty and finish
    await prismaCtx.depotProductVariant.update({
      where: { id: depotVariant.id },
      data: { closingQty: closing },
    });
    return depotVariant.id;
  }

  // ---- Back-compat: variantId refers to ProductVariant (legacy flow) ----
  // Need to create / fetch corresponding DepotProductVariant first
  const legacyVariant = await prismaCtx.productVariant.findUnique({
    where: { id: variantId },
    select: {
      name: true,
      sellingPrice: true,
      purchasePrice: true,
      hsnCode: true,
    },
  });

  if (!legacyVariant) {
    // Variant might have been deleted; skip silently to avoid transaction failure
    return null;
  }

  const { name, sellingPrice, purchasePrice, hsnCode } = legacyVariant;

  const existingDepotRow = await prismaCtx.depotProductVariant.findFirst({
    where: { depotId, productId, name },
  });

  let depotVariantId;
  if (existingDepotRow) {
    await prismaCtx.depotProductVariant.update({
      where: { id: existingDepotRow.id },
      data: { closingQty: closing },
    });
    depotVariantId = existingDepotRow.id;
  } else {
    const created = await prismaCtx.depotProductVariant.create({
      data: {
        depotId,
        productId,
        name,
        hsnCode,
        sellingPrice,
        purchasePrice,
        closingQty: closing,
      },
    });
    depotVariantId = created.id;
  }

  return depotVariantId;
}

module.exports = {
  updateVariantStock,
};
