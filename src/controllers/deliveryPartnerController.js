const bcrypt = require("bcrypt");
const prisma = require("../config/db");
const validateRequest = require("../utils/validateRequest");
const { z } = require("zod");

const getDeliveryPartners = async (req, res, next) => {
  try {
    const { depotId } = req.query;
    
    const whereClause = {};
    if (depotId) {
      whereClause.depotId = parseInt(depotId);
    }
    
    // If DepotAdmin accesses, optionally restrict to their depot in production
    // if (req.user && req.user.role === 'DepotAdmin' && req.user.depotId) {
    //   whereClause.depotId = req.user.depotId;
    // }

    const partners = await prisma.deliveryPartner.findMany({
      where: whereClause,
      include: {
        user: {
          select: { active: true, email: true },
        },
        depot: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ deliveryPartners: partners });
  } catch (error) {
    next(error);
  }
};

const createDeliveryPartner = async (req, res, next) => {
  const schema = z.object({
    depotId: z.coerce.number().int().positive(),
    firstName: z.string().min(1, "First Name is required"),
    middleName: z.string().optional().nullable(),
    lastName: z.string().min(1, "Last Name is required"),
    dob: z.string().or(z.date()).refine((val) => {
      const year = new Date(val).getFullYear();
      return year >= 1900 && year <= new Date().getFullYear();
    }, "Please enter a valid birth year between 1900 and present"),
    mobile: z.string().min(10, "Valid mobile required"),
    email: z.string().email("Valid email required"),
    address1: z.string().min(1, "Address line 1 is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string().min(6, "Valid pincode required"),
    aadhaar: z.string().length(12, "Exactly 12 digits"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

  try {
    const validationResult = await validateRequest(schema, req.body);
    if (validationResult.errors) {
      if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
      return res.status(400).json(validationResult);
    }

    if (req.uploadErrors && Object.keys(req.uploadErrors).length > 0) {
      if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
      return res.status(400).json({ message: "File upload error", errors: req.uploadErrors });
    }

    let profilePhotoUrl = null;
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      const file = req.files.profilePhoto[0];
      const uuid = req.fileUUID && req.fileUUID.profilePhoto;
      if (uuid) {
        profilePhotoUrl = `/uploads/deliveryPartners/profilePhoto/${uuid}/${file.filename}`;
      }
    } else {
      // If profile photo is mandatory, you could add an error here
      // But for now we'll allow it or the frontend schema will catch it
    }

    const { password, email, ...partnerData } = validationResult;

    // Ensure email/mobile is unique
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
      return res.status(400).json({ errors: { message: "Email already in use." } });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User AND DeliveryPartner in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: `${partnerData.firstName} ${partnerData.lastName}`,
          email,
          password: hashedPassword,
          role: "DELIVERY_PARTNER",
          mobile: partnerData.mobile,
          active: true,
          depotId: partnerData.depotId,
        },
      });

      const deliveryPartner = await tx.deliveryPartner.create({
        data: {
          ...partnerData,
          email,
          userId: user.id,
          dob: new Date(partnerData.dob),
          profilePhotoUrl,
        },
      });

      return deliveryPartner;
    });

    res.status(201).json(result);
  } catch (error) {
    if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
    next(error);
  }
};

const updateDeliveryPartnerStatus = async (req, res, next) => {
  const schema = z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  });

  const validationResult = await validateRequest(schema, req.body);
  if (validationResult.errors) {
    return res.status(400).json(validationResult);
  }

  try {
    const updated = await prisma.deliveryPartner.update({
      where: { id: parseInt(req.params.id) },
      data: { status: req.body.status },
    });
    
    // also update the user active status if suspended/inactive
    await prisma.user.update({
      where: { id: updated.userId },
      data: { active: req.body.status === "ACTIVE" },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const getDeliveryPartnerById = async (req, res, next) => {
  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: { select: { active: true, email: true } },
      },
    });
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    res.json(partner);
  } catch (error) {
    next(error);
  }
};

const updateDeliveryPartner = async (req, res, next) => {
  const schema = z.object({
    depotId: z.coerce.number().int().positive(),
    firstName: z.string().min(1, "First Name is required"),
    middleName: z.string().optional().nullable(),
    lastName: z.string().min(1, "Last Name is required"),
    dob: z.string().or(z.date()).refine((val) => {
      const year = new Date(val).getFullYear();
      return year >= 1900 && year <= new Date().getFullYear();
    }, "Please enter a valid birth year between 1900 and today"),
    mobile: z.string().min(10, "Valid mobile required"),
    email: z.string().email("Valid email required"),
    address1: z.string().min(1, "Address line 1 is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string().min(6, "Valid pincode required"),
    aadhaar: z.string().length(12, "Exactly 12 digits"),
    password: z.string().min(6).optional().or(z.literal("")),
  });

  try {
    const validationResult = await validateRequest(schema, req.body);
    if (validationResult.errors) {
      if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
      return res.status(400).json(validationResult);
    }

    if (req.uploadErrors && Object.keys(req.uploadErrors).length > 0) {
      if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
      return res.status(400).json({ message: "File upload error", errors: req.uploadErrors });
    }

    const { password, email, ...partnerData } = validationResult;
    const partnerId = parseInt(req.params.id);

    const existing = await prisma.deliveryPartner.findUnique({ where: { id: partnerId } });
    if (!existing) {
      if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
      return res.status(404).json({ message: "Partner not found" });
    }

    let profilePhotoUrl = existing.profilePhotoUrl;
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      const file = req.files.profilePhoto[0];
      const uuid = req.fileUUID && req.fileUUID.profilePhoto;
      if (uuid) {
        profilePhotoUrl = `/uploads/deliveryPartners/profilePhoto/${uuid}/${file.filename}`;
      }
    }

    // Update in transaction to keep User synced
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update User
      const userData = {
        name: `${partnerData.firstName} ${partnerData.lastName}`,
        email,
        mobile: partnerData.mobile,
      };
      if (password) {
        userData.password = await bcrypt.hash(password, 10);
      }

      await tx.user.update({
        where: { id: existing.userId },
        data: userData,
      });

      // 2. Update Partner
      return await tx.deliveryPartner.update({
        where: { id: partnerId },
        data: {
          ...partnerData,
          email,
          dob: new Date(partnerData.dob),
          profilePhotoUrl,
        },
      });
    });

    res.json(result);
  } catch (error) {
    if (typeof req.cleanupUpload === "function") await req.cleanupUpload();
    next(error);
  }
};

module.exports = {
  getDeliveryPartners,
  createDeliveryPartner,
  getDeliveryPartnerById,
  updateDeliveryPartner,
  updateDeliveryPartnerStatus,
};
