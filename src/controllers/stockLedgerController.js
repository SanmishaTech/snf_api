const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const { z } = require('zod');
const prisma = require('../config/db');

// Validation schema for StockLedger
const stockLedgerSchema = z.object({
  productId: z.coerce.number().int().positive({ message: 'productId must be a positive integer' }),
  variantId: z.coerce.number().int().positive({ message: 'variantId must be a positive integer' }),
  depotId: z.coerce.number().int().positive({ message: 'depotId must be a positive integer' }),
  transactionDate: z.string().min(1, { message: 'transactionDate is required' }), // Expect ISO date string
  receivedQty: z.coerce.number().int().nonnegative({ message: 'receivedQty must be a non-negative integer' }).default(0),
  issuedQty: z.coerce.number().int().nonnegative({ message: 'issuedQty must be a non-negative integer' }).default(0),
  module: z.string().min(1, { message: 'module is required' }),
  foreignKey: z.coerce.number().int().positive({ message: 'foreignKey must be a positive integer' }),
});

const stockLedgerUpdateSchema = stockLedgerSchema.partial();

module.exports = {
  // Create a new StockLedger entry
  createStockLedger: asyncHandler(async (req, res, next) => {
    try {
      const data = stockLedgerSchema.parse(req.body);

      // Coerce transactionDate to Date object for Prisma
      const created = await prisma.stockLedger.create({
        data: {
          ...data,
          transactionDate: new Date(data.transactionDate),
        },
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }),

  // List / query StockLedgers
  getStockLedgers: asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10, productId, variantId, depotId, module } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const where = {};
    if (productId) where.productId = parseInt(productId, 10);
    if (variantId) where.variantId = parseInt(variantId, 10);
    if (depotId) where.depotId = parseInt(depotId, 10);
    if (module) where.module = module;

    try {
      const [records, totalRecords] = await prisma.$transaction([
        prisma.stockLedger.findMany({
          where,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          orderBy: { transactionDate: 'desc' },
          include: {
            product: true,
            variant: true,
            depot: true,
          },
        }),
        prisma.stockLedger.count({ where }),
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

  // Get StockLedger by id
  getStockLedgerById: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      const record = await prisma.stockLedger.findUnique({
        where: { id },
        include: {
          product: true,
          variant: true,
          depot: true,
        },
      });
      if (!record) return next(createError(404, 'StockLedger not found'));
      res.json(record);
    } catch (error) {
      next(error);
    }
  }),

  // Update StockLedger
  updateStockLedger: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      const data = stockLedgerUpdateSchema.parse(req.body);
      if (data.transactionDate) {
        data.transactionDate = new Date(data.transactionDate);
      }
      const updated = await prisma.stockLedger.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      if (error.code === 'P2025') return next(createError(404, 'StockLedger not found'));
      next(error);
    }
  }),

  // Delete StockLedger
  deleteStockLedger: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

    try {
      await prisma.stockLedger.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      if (error.code === 'P2025') return next(createError(404, 'StockLedger not found'));
      next(error);
    }
  }),
};
