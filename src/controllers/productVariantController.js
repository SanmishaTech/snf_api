const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

// NOTE: Creating a new PrismaClient instance here is acceptable for small apps.
// If you already have a centralised prisma instance export it instead.
const prisma = new PrismaClient();

/**
 * GET /api/product-variants
 * Optional query params:
 *   - productId : number -> filter variants belonging to this product
 *   - page, limit -> simple pagination (default page=1, limit=1000)
 */
exports.getProductVariants = asyncHandler(async (req, res, next) => {
  const { productId, page = 1, limit = 1000 } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  const where = {};
  if (productId) {
    const prodId = parseInt(productId, 10);
    if (isNaN(prodId)) {
      return next(createError(400, 'Invalid productId query param'));
    }
    where.productId = prodId;
  }

  const [variants, totalRecords] = await prisma.$transaction([
    prisma.productVariant.findMany({
      where,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: { name: 'asc' },
    }),
    prisma.productVariant.count({ where }),
  ]);

  res.json({
    data: variants,
    totalRecords,
    currentPage: pageNum,
    totalPages: Math.ceil(totalRecords / limitNum),
  });
});

/**
 * GET /api/product-variants/:id
 * Fetch single variant by id
 */
exports.getProductVariantById = asyncHandler(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

  const variant = await prisma.productVariant.findUnique({ where: { id } });
  if (!variant) return next(createError(404, 'Product Variant not found'));
  res.json(variant);
});
