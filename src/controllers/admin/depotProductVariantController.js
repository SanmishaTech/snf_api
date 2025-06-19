const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const { z } = require('zod');
const prisma = require('../../config/db');

// Validation schema for DepotProductVariant (depotId will be taken from logged-in user)
const depotProductVariantSchema = z.object({
  productId: z.coerce.number().int().positive({ message: 'productId must be a positive integer' }),
  name: z.string().min(1, { message: 'name is required' }),
  hsnCode: z.string().optional(),
  sellingPrice: z.coerce.number().nonnegative({ message: 'sellingPrice must be a non-negative number' }),
  purchasePrice: z.coerce.number().nonnegative({ message: 'purchasePrice must be a non-negative number' }),
  minimumQty: z.coerce.number().int().nonnegative({ message: 'minimumQty must be a non-negative integer' }),
  notInStock: z.boolean().optional().default(false),
  isHidden: z.boolean().optional().default(false),
});

// For updates we still forbid changing depotId via body; omit depotId field entirely
const depotProductVariantUpdateSchema = depotProductVariantSchema.partial();

module.exports = {
  // Create a new DepotProductVariant
  createDepotProductVariant: asyncHandler(async (req, res, next) => {
    try {
      const { user } = req;
      if (!user?.depotId) {
        return next(createError(400, 'Logged-in user is not associated with any depot'));
      }
      const data = depotProductVariantSchema.parse(req.body);
      const created = await prisma.depotProductVariant.create({ data: { ...data, depotId: user.depotId } });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }),

  // Get all depot product variants with optional filters and pagination
  getDepotProductVariants: asyncHandler(async (req, res, next) => {
    try {
      const {
        productId,
        depotId: queryDepotId,
        page = 1,
        limit = 1000,
      } = req.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const where = {};
      // ------------------------------
      // Depot filter handling
      // ------------------------------
      if (req.user?.role === 'DEPOT_ADMIN' && req.user.depotId) {
        // Depot Admins are tied to their own depot; ignore query param
        where.depotId = req.user.depotId;
      } else if (queryDepotId) {
        const dId = parseInt(queryDepotId, 10);
        if (isNaN(dId)) return next(createError(400, 'Invalid depotId query param'));
        where.depotId = dId;
      }

      // ------------------------------
      // Product filter handling
      // ------------------------------
      if (productId) {
        const pId = parseInt(productId, 10);
        if (isNaN(pId)) return next(createError(400, 'Invalid productId query param'));
        where.productId = pId;
      }

      const [variants, totalRecords] = await prisma.$transaction([
        prisma.depotProductVariant.findMany({
          include: { product: true, depot: { select: { id: true, name: true } } },
          where,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          orderBy: { name: 'asc' },
        }),
        prisma.depotProductVariant.count({ where }),
      ]);

      res.json({
        data: variants,
        totalRecords,
        currentPage: pageNum,
        totalPages: Math.ceil(totalRecords / limitNum),
      });
    } catch (error) {
      next(error);
    }
  }),

  // Get a single depot product variant by ID
  getDepotProductVariantById: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    const variant = await prisma.depotProductVariant.findUnique({ where: { id }, include: { product: true, depot: { select: { id: true, name: true } } } });
    if (!variant) return next(createError(404, 'Depot Product Variant not found'));
    res.json(variant);
  }),

  // Update a depot product variant
  updateDepotProductVariant: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      const data = depotProductVariantUpdateSchema.parse(req.body);
      const updated = await prisma.depotProductVariant.update({
        where: { id },
        data,
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }),

  // Delete a depot product variant
  deleteDepotProductVariant: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      await prisma.depotProductVariant.delete({ where: { id } });
      res.status(204).end();
    } catch (error) {
      // Prisma foreign key violation (record still referenced elsewhere)
      if (error.code === 'P2003') {
        return next(createError(400, 'Cannot delete this variant because it is referenced in other records (e.g., purchases or wastage). Remove those references first.'));
      }
      next(error);
    }
  }),
};
