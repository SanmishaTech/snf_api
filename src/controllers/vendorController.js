const prisma = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const createError = require('http-errors');
const { z } = require('zod');
const bcrypt = require('bcryptjs'); // Added for password hashing
const validateTraining = require('../utils/validateRequest');

// Zod schema for vendor data (used for update)
const vendorBaseSchema = z.object({
  name: z.string().nonempty('Name is required'),
  contactPersonName: z.string().min(1, "Contact person's name is required").optional().nullable(), 
  address1: z.string().nonempty('Address line 1 is required'),
  address2: z.string().optional().nullable(),
  city: z.string().nonempty('City is required'),
  pincode: z.number().int('Pincode must be an integer'),
  mobile: z.string().nonempty('Mobile number is required').regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
  alternateMobile: z.string().regex(/^\d{10}$/, 'Alternate mobile must be 10 digits').optional().nullable(), 
  email: z.union([z.literal(''), z.string().email('Invalid email format for vendor contact')]).optional().nullable(),
});

// Zod schema for incoming data when creating a vendor with a new user
const createUserAndVendorSchema = z.object({
  userFullName: z.string().nonempty("User's full name is required"),
  userLoginEmail: z.string().email("Invalid login email for user").nonempty("User's login email is required"),
  userPassword: z.string().min(6, "User password must be at least 6 characters"),
  vendorName: z.string().nonempty('Vendor name is required'),
  contactPersonName: z.string().min(1, "Contact person's name is required").optional().nullable(), 
  vendorContactEmail: z.union([z.literal(''), z.string().email('Invalid email format for vendor contact')]).optional().nullable(),
  mobile: z.string().nonempty('Mobile number is required').regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
  alternateMobile: z.string().regex(/^\d{10}$/, 'Alternate mobile must be 10 digits').optional().nullable(), 
  address1: z.string().nonempty('Address line 1 is required'),
  address2: z.string().optional().nullable(),
  city: z.string().nonempty('City is required'),
  pincode: z.number().int('Pincode must be an integer'),
});

const createVendor = asyncHandler(async (req, res, next) => {
  // const validationResult = createUserAndVendorSchema.safeParse(req.body);
  // if (!validationResult.success) {
  //   return next(createError(400, { message: 'Validation failed', errors: validationResult.error.flatten().fieldErrors }));
  // }
  const validationresults = await validateTraining(createUserAndVendorSchema, req.body, res);
  
  const {
    userFullName,
    userLoginEmail,
    userPassword,
    vendorName,
    contactPersonName, 
    vendorContactEmail,
    mobile,
    alternateMobile, 
    address1,
    address2,
    city,
    pincode
  } = req.body;

  const existingUserByLoginEmail = await prisma.user.findUnique({ where: { email: userLoginEmail } });
  if (existingUserByLoginEmail) {
    return next(createError(400, `User with login email ${userLoginEmail} already exists.`));
  }

  if (vendorContactEmail && typeof vendorContactEmail === 'string' && vendorContactEmail.trim() !== '') {
    const existingVendorByContactEmail = await prisma.vendor.findUnique({ where: { email: vendorContactEmail } });
    if (existingVendorByContactEmail) {
      return next(createError(400, `A vendor profile with contact email ${vendorContactEmail} already exists.`));
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userPassword, salt);

  const result = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name: userFullName,
        email: userLoginEmail,
        password: hashedPassword,
        role: 'VENDOR', 
        active: true, 
      },
    });

    const newVendor = await tx.vendor.create({
      data: {
        name: vendorName,
        contactPersonName, 
        email: vendorContactEmail, 
        mobile,
        alternateMobile, 
        address1,
        address2,
        city,
        pincode,
        user: {
          connect: { id: newUser.id },
        },
      },
    });

    return { newUser, newVendor };
  });

  res.status(201).json({
    message: 'Vendor and user account created successfully.',
    vendor: result.newVendor,
    user: { id: result.newUser.id, name: result.newUser.name, email: result.newUser.email, role: result.newUser.role }
  });
});

const getAllVendors = asyncHandler(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 10, 
    sortBy = 'name', 
    sortOrder = 'asc', 
    search = '', 
    active = 'all' // 'all', 'true', 'false'
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  let whereConditions = {};

  if (search) {
    whereConditions.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { contactPersonName: { contains: search } },
      { mobile: { contains: search } },
      { city: { contains: search } },
    ];
    whereConditions.OR.push({
      user: {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
        ],
      },
    });
  }

  if (active !== 'all') {
    whereConditions.user = {
      active: active === 'true'
    };
  }

  const orderByClause = {};
  if (sortBy) {
    orderByClause[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
  }

  try {
    const vendors = await prisma.vendor.findMany({
      where: whereConditions,
      include: { 
        user: { 
          select: { 
            id: true, 
            name: true, // This is user's full name
            email: true, // This is user's login email
            role: true, 
            active: true 
          }
        }
      },
      skip: skip,
      take: limitNum,
      orderBy: orderByClause,
    });

    const totalRecords = await prisma.vendor.count({
      where: whereConditions,
    });

    res.status(200).json({
      data: vendors,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    next(createError(500, 'Failed to fetch vendors.'));
  }
});

const getVendorById = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) {
    return next(createError(400, 'Invalid vendor ID format'));
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } },
  });

  if (!vendor) {
    return next(createError(404, `Vendor with ID ${vendorId} not found`));
  }

  if (req.user.role === 'VENDOR' && vendor.userId !== req.user.id) {
    return next(createError(403, 'Forbidden: You can only view your own vendor profile.'));
  }

  res.status(200).json(vendor);
});

const updateVendor = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) {
    return next(createError(400, 'Invalid vendor ID format'));
  }

  const validationResult = vendorBaseSchema.safeParse(req.body);
  if (!validationResult.success) {
    return next(createError(400, { message: 'Validation failed', errors: validationResult.error.flatten().fieldErrors }));
  }

  const {
    name,
    contactPersonName,
    address1,
    address2,
    city,
    pincode,
    mobile,
    alternateMobile,
    email
  } = validationResult.data;

  const vendorDataToUpdate = {
    name,
    contactPersonName,
    address1,
    address2,
    city,
    pincode,
    mobile,
    alternateMobile,
    email
  };

  const existingVendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!existingVendor) {
    return next(createError(404, `Vendor with ID ${vendorId} not found`));
  }

  if (req.user.role === 'VENDOR' && existingVendor.userId !== req.user.id) {
    return next(createError(403, 'Forbidden: You can only update your own vendor profile.'));
  }

  if (email && email !== existingVendor.email) {
    const vendorWithNewEmail = await prisma.vendor.findUnique({ where: { email } });
    if (vendorWithNewEmail) {
      return next(createError(400, `Vendor email ${email} is already in use.`));
    }
  }

  const updatedVendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: vendorDataToUpdate, 
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } },
  });

  res.status(200).json(updatedVendor);
});

const deleteVendor = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) {
    return next(createError(400, 'Invalid vendor ID format'));
  }

  const vendorDetails = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { userId: true },
  });

  if (!vendorDetails) {
    return next(createError(404, `Vendor with ID ${vendorId} not found`));
  }

  const userIdToDelete = vendorDetails.userId;

  try {
    await prisma.$transaction(async (tx) => {
      // Step 1: Delete VendorOrders associated with the vendor.
      // This will cascade-delete associated OrderItems due to `onDelete: Cascade`
      // in the OrderItem model's vendorOrder relation.
      await tx.vendorOrder.deleteMany({
        where: { vendorId: vendorId },
      });

      // Products are not deleted as they are general catalog items and not exclusively owned by a vendor.
      // The Vendor record itself will be deleted when its associated User is deleted (next step in the code)
      // due to `onDelete: Cascade` on the `Vendor.user` relation.

      // Step 5: Delete the associated user
      if (userIdToDelete) {
        await tx.user.delete({
          where: { id: userIdToDelete },
        });
      }
    });

    res.status(200).json({ message: `Vendor with ID ${vendorId} and all associated data deleted successfully.` });
  } catch (error) {
    console.error(`Detailed error deleting vendor ${vendorId}:`, error); // Enhanced logging
    if (error.code === 'P2003') { // Prisma foreign key constraint violation
      return next(createError(409, `Cannot delete vendor (ID: ${vendorId}). It is still referenced by other records (e.g., Orders, Products, or OrderItems). Please ensure all related data is removed or reassigned. Details: ${error.meta?.field_name ? 'Field: ' + error.meta.field_name : error.message}`));
    }
    // Generic server error for other issues
    return next(createError(500, `Could not delete vendor with ID ${vendorId}. An unexpected error occurred. Check server logs for details.`));
  }
});

module.exports = {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
};
