const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const createError = require('http-errors');
const validateRequest = require('../../utils/validateRequest');

// Zod schema for depot creation and update
const depotSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required').max(255),
  contactPerson: z.string().max(255).optional().nullable(),
  contactNumber: z.string().max(20).optional().nullable(),
  isOnline: z.boolean().optional(),
});

// Schema to create depot along with admin user details
const createDepotSchema = depotSchema.extend({
  userFullName: z.string().min(2, { message: 'User full name is required' }),
  userLoginEmail: z.string().optional().nullable(),
  userPassword: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
});

// Create a new Depot along with its admin user
exports.createDepot = async (req, res, next) => {
  try {
    const validationResult = await validateRequest(createDepotSchema, req.body, {});
    if (validationResult.errors) {
      return res.status(400).json(validationResult);
    }

    const {
      userFullName,
      userLoginEmail,
      userPassword,
      ...depotInput
    } = validationResult;

    // Check duplicates for depot name
    const existingDepot = await prisma.depot.findUnique({ where: { name: depotInput.name } });
    if (existingDepot) {
      return next(createError(409, `A depot named ${depotInput.name} already exists.`));
    }

    // Duplicate user email check
    if (userLoginEmail) {
      const existingUser = await prisma.user.findUnique({ where: { email: userLoginEmail } });
      if (existingUser) {
        return next(createError(400, `User with email ${userLoginEmail} already exists.`));
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userPassword, salt);

    // Transaction: create depot then user linked via depotId
    const { newDepot, newUser } = await prisma.$transaction(async (tx) => {
      const newDepot = await tx.depot.create({
        data: depotInput,
      });

      const newUser = await tx.user.create({
        data: {
          name: userFullName,
          email: userLoginEmail,
          password: hashedPassword,
          role: 'DepotAdmin',
          active: true,
          depot: {
            connect: { id: newDepot.id },
          },
        },
      });

      return { newDepot, newUser };
    });

    return res.status(201).json({
      message: 'Depot and admin user created successfully.',
      depot: newDepot,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    });
  } catch (error) {
    console.error('Error creating depot and user:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
      return next(createError(400, 'Email is already in use.'));
    }
    return next(createError(500, 'Failed to create depot and user.'));
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
            { city: { contains: search, mode: 'insensitive' } },
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
