const prismaClient = require('../config/db');

/**
 * Recalculate and upsert VariantStock for a given product / variant / depot
 * @param {Object} params
 * @param {number} params.productId
 * @param {number} params.variantId
 * @param {number} params.depotId
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} [prismaCtx]
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

  // Check if VariantStock row exists
  const existing = await prismaCtx.variantStock.findFirst({
    where: { productId, variantId, depotId },
  });

  if (existing) {
    await prismaCtx.variantStock.update({
      where: { id: existing.id },
      data: { closingQty: closing.toString() },
    });
  } else {
    await prismaCtx.variantStock.create({
      data: {
        productId,
        variantId,
        depotId,
        closingQty: closing.toString(),
      },
    });
  }
}

module.exports = {
  updateVariantStock,
};
