const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Zod schema for depot creation and update
const depotSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  address: z.string().min(1, 'Address is required'),
  contactPerson: z.string().max(255).optional().nullable(),
  contactNumber: z.string().max(20).optional().nullable(),
});

// Create a new Depot
exports.createDepot = async (req, res, next) => {
  try {
    const validatedData = await depotSchema.parseAsync(req.body);

    const existingDepot = await prisma.depot.findUnique({
      where: { name: validatedData.name },
    });

    if (existingDepot) {
      return res.status(409).json({ error: 'A depot with this name already exists.' });
    }

    const newDepot = await prisma.depot.create({
      data: validatedData,
    });
    res.status(201).json(newDepot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    next(error);
  }
};

// Get all Depots
exports.getAllDepots = async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

    const whereClause = search ? {
        OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { address: { contains: search, mode: 'insensitive' } },
        ],
    } : {};

    try {
        const [depots, totalRecords] = await prisma.$transaction([
            prisma.depot.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
            }),
            prisma.depot.count({ where: whereClause }),
        ]);

        res.status(200).json({
            depots,
            page,
            totalPages: Math.ceil(totalRecords / limit),
            totalRecords,
        });
    } catch (error) {
        next(error);
    }
};

// Get all Depots for a list
exports.getAllDepotsList = async (req, res, next) => {
    try {
        const depots = await prisma.depot.findMany({
            select: {
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        res.status(200).json(depots);
    } catch (error) {
        next(error);
    }
};

// Get a single Depot by ID
exports.getDepotById = async (req, res, next) => {
    try {
        const depot = await prisma.depot.findUnique({
            where: { id: parseInt(req.params.id) },
        });
        if (!depot) {
            return res.status(404).json({ error: 'Depot not found' });
        }
        res.status(200).json(depot);
    } catch (error) {
        next(error);
    }
};

// Update a Depot by ID
exports.updateDepot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = await depotSchema.parseAsync(req.body);

    if (validatedData.name) {
      const existingDepot = await prisma.depot.findFirst({
        where: {
          name: validatedData.name,
          id: { not: parseInt(id) },
        },
      });
      if (existingDepot) {
        return res.status(409).json({ error: 'Another depot with this name already exists.' });
      }
    }

    const updatedDepot = await prisma.depot.update({
      where: { id: parseInt(id) },
      data: validatedData,
    });
    res.status(200).json(updatedDepot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Depot not found' });
    }
    next(error);
  }
};

// Delete a Depot by ID
exports.deleteDepot = async (req, res, next) => {
    try {
        const depotId = parseInt(req.params.id);

        // Check if depot is referenced in other modules
        const [purchaseCount, wastageCount, stockLedgerCount, variantStockCount, areaCount] = await prisma.$transaction([
            prisma.purchase.count({ where: { depotId } }),
            prisma.wastage.count({ where: { depotId } }),
            prisma.stockLedger.count({ where: { depotId } }),
            prisma.variantStock.count({ where: { depotId } }),
            prisma.areaMaster.count({ where: { depotId } }),
        ]);

        if (
            purchaseCount > 0 ||
            wastageCount > 0 ||
            stockLedgerCount > 0 ||
            variantStockCount > 0 ||
            areaCount > 0
        ) {
            return res.status(400).json({
                message:
                    'Depot cannot be deleted because it is associated with other records (purchase, wastage, stock, variant, or area). Please remove these associations first.',
            });
        }

        await prisma.depot.delete({ where: { id: depotId } });
        res.status(204).send();
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Depot not found' });
        }
        next(error);
    }
};
