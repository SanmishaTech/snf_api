const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/depots - List depots (with simple pagination)
exports.getDepots = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 1000 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  const [depots, totalRecords] = await prisma.$transaction([
    prisma.depot.findMany({
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: { name: 'asc' },
    }),
    prisma.depot.count(),
  ]);

  res.json({
    data: depots,
    totalRecords,
    currentPage: pageNum,
    totalPages: Math.ceil(totalRecords / limitNum),
  });
});

// GET /api/depots/:id - single depot
exports.getDepotById = asyncHandler(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return next(createError(400, 'Invalid id parameter'));

  const depot = await prisma.depot.findUnique({ where: { id } });
  if (!depot) return next(createError(404, 'Depot not found'));
  res.json(depot);
});
