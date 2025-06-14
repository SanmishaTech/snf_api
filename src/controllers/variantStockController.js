const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const { z } = require('zod');
const prisma = require('../config/db');

// Validation schema for VariantStock
const variantStockSchema = z.object({
  productId: z.coerce.number().int().positive({ message: 'productId must be a positive integer' }),
  variantId: z.coerce.number().int().positive({ message: 'variantId must be a positive integer' }),
  depotId: z.coerce.number().int().positive({ message: 'depotId must be a positive integer' }),
  closingQty: z.string().min(1, { message: 'closingQty is required' }),
});

const variantStockUpdateSchema = variantStockSchema.partial();

module.exports = {
  // Create a new VariantStock
  createVariantStock: asyncHandler(async (req, res, next) => {
    try {
      const data = variantStockSchema.parse(req.body);
      const created = await prisma.variantStock.create({ data });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }),

  // List / query VariantStocks
  getVariantStocks: asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10, productId, variantId, depotId, search } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const where = {};
    if (productId) where.productId = parseInt(productId, 10);
    if (variantId) where.variantId = parseInt(variantId, 10);
    if (depotId) where.depotId = parseInt(depotId, 10);
    if (search) {
      const searchStr = search.toString();
      where.OR = [
        {
          product: {
            name: {
              contains: searchStr,
            },
          },
        },
        {
          variant: {
            name: {
              contains: searchStr,
            },
          },
        },
      ];
    }

    try {
      const [records, totalRecords] = await prisma.$transaction([
        prisma.variantStock.findMany({
          where,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          include: {
            product: true,
            variant: true,
            depot: true,
          },
        }),
        prisma.variantStock.count({ where }),
      ]);

      res.json({
        data: records,
        totalPages: Math.ceil(totalRecords / limitNum),
        totalRecords,
        currentPage: pageNum,
      });
    } catch (error) {
      next(error);
    }
  }),

  // Get VariantStock by id
  getVariantStockById: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      const record = await prisma.variantStock.findUnique({
        where: { id },
        include: {
          product: true,
          variant: true,
          depot: true,
        },
      });
      if (!record) return next(createError(404, 'VariantStock not found'));
      res.json(record);
    } catch (error) {
      next(error);
    }
  }),

  // Update VariantStock
  updateVariantStock: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      const data = variantStockUpdateSchema.parse(req.body);
      const updated = await prisma.variantStock.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      if (error.code === 'P2025') return next(createError(404, 'VariantStock not found'));
      next(error);
    }
  }),

  // Delete VariantStock
  deleteVariantStock: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      await prisma.variantStock.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      if (error.code === 'P2025') return next(createError(404, 'VariantStock not found'));
      next(error);
    }
  }),
};
