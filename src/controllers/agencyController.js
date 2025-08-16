const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const validateRequest  = require('../utils/validateRequest');
const { z } = require('zod'); // Add Zod import

const prisma = new PrismaClient();

// --- Zod Schemas Definition ---
// Base schema for common agency fields
const baseAgencySchema = z.object({
  name: z.string().min(2, { message: 'Agency name must be at least 2 characters long' }),
  contactPersonName: z.string().optional(),
  address1: z.string().min(5, { message: 'Address line 1 must be at least 5 characters long' }),
  address2: z.any().optional(),
  city: z.string().optional().nullable(),
  pincode: z.string().regex(/^\d{6}$/, { message: 'Pincode must be 6 digits' }).transform(Number).or(z.number()),
  mobile: z.string().regex(/^\d{10}$/, { message: 'Mobile number must be 10 digits' }),
  alternateMobile: z.any().optional().nullable(),
  email: z.string().optional().nullable(),
  depotId: z.coerce.number().int().positive().optional(), // Optional depot assignment
});

// Schema for creating a new agency, including user details for the agency's primary user
const createAgencySchema = baseAgencySchema.extend({
  userFullName: z.string().min(2, { message: 'User full name must be at least 2 characters long' }),
  userLoginEmail: z.string().optional().nullable(),
  userPassword: z.string().min(6, { message: 'Password must be at least 6 characters long' })
});
// --- End Zod Schemas Definition ---

/**
 * @desc    Create a new agency and a new user for that agency
 * @route   POST /api/agencies
 * @access  Private/Admin (AGENCIES_CREATE)
 */
const createAgency = asyncHandler(async (req, res, next) => {
  const { role, status, ...requestBody } = req.body; // Exclude role and status if they are not part of the direct input for creation schema

  const validationResult = await validateRequest(createAgencySchema, requestBody, req.files || {});

  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  // If we reach here, validationResult is the actual validated data.
  const {
    userFullName,
    userLoginEmail,
    userPassword,
    // All other fields from agencyBaseSchema are in agencyDataInput
    ...agencyDataInput 
  } = validationResult;

  const { email: agencyEmail, contactPersonName, alternateMobile, depotId, ...otherAgencyFields } = agencyDataInput;

  const existingUserByLoginEmail = await prisma.user.findUnique({ where: { email: userLoginEmail } });
  if (existingUserByLoginEmail) {
    return next(createError(400, `User with login email ${userLoginEmail} already exists.`));
  }

  if (agencyEmail) {
    const existingAgencyByContactEmail = await prisma.agency.findUnique({ where: { email: agencyEmail } });
    if (existingAgencyByContactEmail) {
      return next(createError(400, `Agency with contact email ${agencyEmail} already exists.`));
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userPassword, salt);

  try {
    const newAgencyWithUser = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: userFullName,
          email: userLoginEmail,
          password: hashedPassword,
          role: 'AGENCY',
          active: true,
        },
      });

      const newAgency = await tx.agency.create({
        data: {
          ...otherAgencyFields, // Spread the rest of the agency fields
          email: agencyEmail,       // Agency's own contact email
          contactPersonName,    // Explicitly include
          alternateMobile,      // Explicitly include
          user: {
            connect: { id: newUser.id },
          },
          ...(depotId && {
            depot: {
              connect: { id: depotId }
            }
          }),
        },
        include: { 
          user: { select: { id: true, name: true, email: true, role: true, active: true } },
          depot: { select: { id: true, name: true, address: true, city: true } }
        },
      });
      return newAgency;
    });

    res.status(201).json(newAgencyWithUser);
  } catch (error) {
    console.error("Error during agency/user creation transaction:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        let field = error.meta.target.includes('User_email_key') ? 'User login email' : 'Agency contact email';
        return next(createError(400, `${field} is already in use.`));
    }
    return next(createError(500, 'Failed to create agency and user.'));
  }
});

/**
 * @desc    Get all agencies
 * @route   GET /api/agencies
 * @access  Private/Admin (AGENCIES_LIST)
 */
const getAllAgencies = asyncHandler(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 10, 
    sortBy = 'name', 
    sortOrder = 'asc', 
    search = '', 
    active = 'all' 
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return next(createError(400, 'Page number must be a positive integer.'));
  }
  if (isNaN(limitNum) || limitNum < 1) {
    return next(createError(400, 'Limit must be a positive integer.'));
  }

  const whereConditions = {};

  if (search) {
    whereConditions.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (active !== 'all') {
    whereConditions.user = {
      active: active === 'true'
    };
  }

  const validSortByFields = ['name', 'email', 'city', 'createdAt', 'updatedAt']; 
  const orderByField = validSortByFields.includes(sortBy) ? sortBy : 'name';
  const orderByDirection = sortOrder === 'desc' ? 'desc' : 'asc';

  try {
    const agencies = await prisma.agency.findMany({
      where: whereConditions,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: {
        [orderByField]: orderByDirection,
      },
      include: { 
        user: { select: { id: true, name: true, email: true, role: true, active: true } },
        depot: { select: { id: true, name: true, address: true, city: true } }
      },
    });

    const totalRecords = await prisma.agency.count({ where: whereConditions });
    const totalPages = Math.ceil(totalRecords / limitNum);

    res.status(200).json({
      data: agencies,
      totalPages,
      totalRecords,
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching agencies:', error);
    next(createError(500, 'Failed to fetch agencies'));
  }
});

/**
 * @desc    Get a single agency by ID
 * @route   GET /api/agencies/:id
 * @access  Private (AGENCIES_READ for Admin, or Agency for their own profile)
 */
const getAgencyById = asyncHandler(async (req, res, next) => {
  const agencyId = parseInt(req.params.id, 10);
  if (isNaN(agencyId)) {
    return next(createError(400, 'Invalid agency ID format'));
  }

  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    include: { 
      user: { select: { id: true, name: true, email: true, role: true, active: true } },
      depot: { select: { id: true, name: true, address: true, city: true } }
    },
  });

  if (!agency) {
    return next(createError(404, `Agency with ID ${agencyId} not found`));
  }

  if (req.user.role === 'AGENCY' && agency.userId !== req.user.id) {
    return next(createError(403, 'Forbidden: You can only view your own agency profile.'));
  }

  res.status(200).json(agency);
});

/**
 * @desc    Update an agency
 * @route   PUT /api/agencies/:id
 * @access  Private (AGENCIES_UPDATE for Admin, or Agency for their own profile)
 */
const updateAgency = asyncHandler(async (req, res, next) => {
  const agencyId = parseInt(req.params.id, 10);
  if (isNaN(agencyId)) {
    return next(createError(400, 'Invalid agency ID format'));
  }

  const validationResult = await validateRequest(baseAgencySchema, req.body, req.files || {});

  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  // If we reach here, validationResult is the actual validated data.
  const { 
    email,
    contactPersonName,
    alternateMobile,
    depotId,
    ...otherAgencyFields
  } = validationResult;

  const existingAgency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!existingAgency) {
    return next(createError(404, `Agency with ID ${agencyId} not found`));
  }

  if (req.user.role === 'AGENCY' && existingAgency.userId !== req.user.id) {
    return next(createError(403, 'Forbidden: You can only update your own agency profile.'));
  }

  if (email && email !== existingAgency.email) {
    const agencyWithNewEmail = await prisma.agency.findUnique({ where: { email } });
    if (agencyWithNewEmail) {
      return next(createError(400, `Agency email ${email} is already in use.`));
    }
  }

  const updatedAgency = await prisma.agency.update({
    where: { id: agencyId },
    data: {
      ...otherAgencyFields, // Spread the rest of the agency fields
      email,              // Explicitly include email
      contactPersonName,  // Explicitly include
      alternateMobile,    // Explicitly include
      ...(depotId ? {
        depot: {
          connect: { id: depotId }
        }
      } : {
        depot: {
          disconnect: true
        }
      }),
    },
    include: { 
      user: { select: { id: true, name: true, email: true, role: true, active: true } },
      depot: { select: { id: true, name: true, address: true, city: true } }
    },
  });

  res.status(200).json(updatedAgency);
});

/**
 * @desc    Delete an agency
 * @route   DELETE /api/agencies/:id
 * @access  Private/Admin (AGENCIES_DELETE)
 */
const deleteAgency = asyncHandler(async (req, res, next) => {
  const agencyId = parseInt(req.params.id, 10);
  if (isNaN(agencyId)) {
    return next(createError(400, 'Invalid agency ID format'));
  }

  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) {
    return next(createError(404, `Agency with ID ${agencyId} not found`));
  }

  try {
    await prisma.agency.delete({ where: { id: agencyId } });
    res.status(200).json({ message: `Agency with ID ${agencyId} deleted successfully` });
  } catch (error) {
    if (error.code === 'P2003') {
      // P2003 is the Prisma error code for foreign key constraint violation
      return next(createError(409, `Cannot delete agency with ID ${agencyId}: It is associated with existing records (e.g., order items, subscriptions). Please remove these associations before attempting to delete the agency.`));
    }
    // For other errors, pass them to the default error handler
    return next(error);
  }
});

module.exports = {
  createAgency,
  getAllAgencies,
  getAgencyById,
  updateAgency,
  deleteAgency,
};
