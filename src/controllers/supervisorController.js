const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const validateRequest  = require('../utils/validateRequest');
const { z } = require('zod'); // Add Zod import

const prisma = new PrismaClient();

// --- Zod Schemas Definition ---
// Base schema for common supervisor fields
const supervisorBaseSchema = z.object({
  name: z.string().min(2, { message: 'Supervisor name must be at least 2 characters long' }),
  contactPersonName: z.string().optional(),
  address1: z.string().min(5, { message: 'Address line 1 must be at least 5 characters long' }),
  address2: z.any().optional(),
  city: z.string().optional().nullable(),
  pincode: z.string().regex(/^\d{6}$/, { message: 'Pincode must be 6 digits' }).transform(Number).or(z.number()),
  mobile: z.string().regex(/^\d{10}$/, { message: 'Mobile number must be 10 digits' }),
  alternateMobile: z.any().optional().nullable(),
  email: z.string().optional().nullable(),
  depotId: z.number().int().positive().optional().nullable(),
  agencyId: z.number().int().positive().optional().nullable(),
});

// Schema for creating a new supervisor, including user details for the supervisor's primary user
const createSupervisorSchema = supervisorBaseSchema.extend({
  userFullName: z.string().min(2, { message: 'User full name must be at least 2 characters long' }),
  userLoginEmail: z.string().optional().nullable(),
  userPassword: z.string().min(6, { message: 'Password must be at least 6 characters long' })
});
// --- End Zod Schemas Definition ---

/**
 * @desc    Create a new supervisor and a new user for that supervisor
 * @route   POST /api/supervisors
 * @access  Private/Admin (SUPERVISORS_CREATE)
 */
const createSupervisor = asyncHandler(async (req, res, next) => {
  const { role, status, ...requestBody } = req.body; // Exclude role and status if they are not part of the direct input for creation schema

  const validationResult = await validateRequest(createSupervisorSchema, requestBody, req.files || {});

  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  // If we reach here, validationResult is the actual validated data.
  const {
    userFullName,
    userLoginEmail,
    userPassword,
    // All other fields from supervisorBaseSchema are in supervisorDataInput
    ...supervisorDataInput 
  } = validationResult;

  const { email: supervisorEmail, contactPersonName, alternateMobile, depotId, agencyId, ...otherSupervisorFields } = supervisorDataInput;

  const existingUserByLoginEmail = await prisma.user.findUnique({ where: { email: userLoginEmail } });
  if (existingUserByLoginEmail) {
    return next(createError(400, `User with login email ${userLoginEmail} already exists.`));
  }

  if (supervisorEmail) {
    const existingSupervisorByContactEmail = await prisma.supervisor.findUnique({ where: { email: supervisorEmail } });
    if (existingSupervisorByContactEmail) {
      return next(createError(400, `Supervisor with contact email ${supervisorEmail} already exists.`));
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userPassword, salt);

  try {
    const newSupervisorWithUser = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: userFullName,
          email: userLoginEmail,
          password: hashedPassword,
          role: 'SUPERVISOR',
          active: true,
          depotId: depotId || null,
        },
      });

      const supervisorData = {
        ...otherSupervisorFields, // Spread the rest of the supervisor fields
        email: supervisorEmail,       // Supervisor's own contact email
        contactPersonName,    // Explicitly include
        alternateMobile,      // Explicitly include
        user: {
          connect: { id: newUser.id },
        },
      };

      // Only add depot connection if depotId is provided
      if (depotId) {
        supervisorData.depot = {
          connect: { id: depotId },
        };
      }

      // Only add agency connection if agencyId is provided
      if (agencyId) {
        supervisorData.agency = {
          connect: { id: agencyId },
        };
      }

      const newSupervisor = await tx.supervisor.create({
        data: supervisorData,
        include: { 
          user: { select: { id: true, name: true, email: true, role: true, active: true } },
          depot: { select: { id: true, name: true } },
          agency: { select: { id: true, name: true } }
        },
      });
      return newSupervisor;
    });

    res.status(201).json(newSupervisorWithUser);
  } catch (error) {
    console.error("Error during supervisor/user creation transaction:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        let field = error.meta.target.includes('User_email_key') ? 'User login email' : 'Supervisor contact email';
        return next(createError(400, `${field} is already in use.`));
    }
    return next(createError(500, 'Failed to create supervisor and user.'));
  }
});

/**
 * @desc    Get all supervisors
 * @route   GET /api/supervisors
 * @access  Private/Admin (SUPERVISORS_LIST)
 */
const getAllSupervisors = asyncHandler(async (req, res, next) => {
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
    const supervisors = await prisma.supervisor.findMany({
      where: whereConditions,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: {
        [orderByField]: orderByDirection,
      },
      include: { 
        user: { select: { id: true, name: true, email: true, role: true, active: true } },
        depot: { select: { id: true, name: true } },
        agency: { select: { id: true, name: true } }
      },
    });

    const totalRecords = await prisma.supervisor.count({ where: whereConditions });
    const totalPages = Math.ceil(totalRecords / limitNum);

    res.status(200).json({
      data: supervisors,
      totalPages,
      totalRecords,
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching supervisors:', error);
    next(createError(500, 'Failed to fetch supervisors'));
  }
});

/**
 * @desc    Get a single supervisor by ID
 * @route   GET /api/supervisors/:id
 * @access  Private (SUPERVISORS_READ for Admin, or Supervisor for their own profile)
 */
const getSupervisorById = asyncHandler(async (req, res, next) => {
  const supervisorId = parseInt(req.params.id, 10);
  if (isNaN(supervisorId)) {
    return next(createError(400, 'Invalid supervisor ID format'));
  }

  const supervisor = await prisma.supervisor.findUnique({
    where: { id: supervisorId },
    include: { 
      user: { select: { id: true, name: true, email: true, role: true, active: true } },
      depot: { select: { id: true, name: true } },
      agency: { select: { id: true, name: true } }
    },
  });

  if (!supervisor) {
    return next(createError(404, `Supervisor with ID ${supervisorId} not found`));
  }

  if (req.user.role === 'SUPERVISOR' && supervisor.userId !== req.user.id) {
    return next(createError(403, 'Forbidden: You can only view your own supervisor profile.'));
  }

  res.status(200).json(supervisor);
});

/**
 * @desc    Update a supervisor
 * @route   PUT /api/supervisors/:id
 * @access  Private (SUPERVISORS_UPDATE for Admin, or Supervisor for their own profile)
 */
const updateSupervisor = asyncHandler(async (req, res, next) => {
  const supervisorId = parseInt(req.params.id, 10);
  if (isNaN(supervisorId)) {
    return next(createError(400, 'Invalid supervisor ID format'));
  }

  const validationResult = await validateRequest(supervisorBaseSchema, req.body, req.files || {});

  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  // If we reach here, validationResult is the actual validated data.
  const { 
    email,
    contactPersonName,
    alternateMobile,
    depotId,
    agencyId,
    ...otherSupervisorFields
  } = validationResult;

  const existingSupervisor = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
  if (!existingSupervisor) {
    return next(createError(404, `Supervisor with ID ${supervisorId} not found`));
  }

  if (req.user.role === 'SUPERVISOR' && existingSupervisor.userId !== req.user.id) {
    return next(createError(403, 'Forbidden: You can only update your own supervisor profile.'));
  }

  if (email && email !== existingSupervisor.email) {
    const supervisorWithNewEmail = await prisma.supervisor.findUnique({ where: { email } });
    if (supervisorWithNewEmail) {
      return next(createError(400, `Supervisor email ${email} is already in use.`));
    }
  }

  try {
    const updatedSupervisor = await prisma.$transaction(async (tx) => {
      // Prepare supervisor update data
      const supervisorUpdateData = {
        ...otherSupervisorFields, // Spread the rest of the supervisor fields
        email,              // Explicitly include email
        contactPersonName,  // Explicitly include
        alternateMobile,    // Explicitly include
      };

      // Handle depot relationship
      if (depotId !== existingSupervisor.depotId) {
        if (depotId) {
          supervisorUpdateData.depot = {
            connect: { id: depotId },
          };
        } else {
          supervisorUpdateData.depot = {
            disconnect: true,
          };
        }
      }

      // Handle agency relationship
      if (agencyId !== existingSupervisor.agencyId) {
        if (agencyId) {
          supervisorUpdateData.agency = {
            connect: { id: agencyId },
          };
        } else {
          supervisorUpdateData.agency = {
            disconnect: true,
          };
        }
      }

      // Update the supervisor record
      const supervisor = await tx.supervisor.update({
        where: { id: supervisorId },
        data: supervisorUpdateData,
        include: { 
          user: { select: { id: true, name: true, email: true, role: true, active: true } },
          depot: { select: { id: true, name: true } },
          agency: { select: { id: true, name: true } }
        },
      });

      // Update the user's depotId if it has changed
      if (depotId !== existingSupervisor.depotId) {
        await tx.user.update({
          where: { id: existingSupervisor.userId },
          data: { depotId: depotId || null }
        });
      }

      return supervisor;
    });

    res.status(200).json(updatedSupervisor);
  } catch (error) {
    console.error('Error updating supervisor:', error);
    return next(createError(500, 'Failed to update supervisor.'));
  }
});

/**
 * @desc    Delete a supervisor
 * @route   DELETE /api/supervisors/:id
 * @access  Private/Admin (SUPERVISORS_DELETE)
 */
const deleteSupervisor = asyncHandler(async (req, res, next) => {
  const supervisorId = parseInt(req.params.id, 10);
  if (isNaN(supervisorId)) {
    return next(createError(400, 'Invalid supervisor ID format'));
  }

  const supervisor = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
  if (!supervisor) {
    return next(createError(404, `Supervisor with ID ${supervisorId} not found`));
  }

  try {
    await prisma.supervisor.delete({ where: { id: supervisorId } });
    res.status(200).json({ message: `Supervisor with ID ${supervisorId} deleted successfully` });
  } catch (error) {
    if (error.code === 'P2003') {
      // P2003 is the Prisma error code for foreign key constraint violation
      return next(createError(409, `Cannot delete supervisor with ID ${supervisorId}: It is associated with existing records. Please remove these associations before attempting to delete the supervisor.`));
    }
    // For other errors, pass them to the default error handler
    return next(error);
  }
});

module.exports = {
  createSupervisor,
  getAllSupervisors,
  getSupervisorById,
  updateSupervisor,
  deleteSupervisor,
};