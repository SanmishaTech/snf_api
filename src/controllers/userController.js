const createError = require("http-errors");
const bcrypt = require("bcrypt");
const ExcelJS = require("exceljs");
const prisma = require("../config/db");
const validateRequest = require("../utils/validateRequest");
const roles = require("../config/roles");
const aclService = require("../services/aclService");
const { z } = require("zod");

const getUsers = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const roles = req.query.roles ? req.query.roles.split(",") : []; // Handle multiple roles as a comma-separated string
  const active =
    req.query.active === "true"
      ? true
      : req.query.active === "false"
        ? false
        : undefined;
  const sortBy = req.query.sortBy || "id";
  const sortOrder = req.query.sortOrder === "desc" ? "desc" : "asc";
  const exportToExcel = req.query.export === "true"; // Check if export is requested

  // Check if the user has the 'users.export' permission using ACL service
  if (exportToExcel && !aclService.hasPermission(req.user, "users.export")) {
    return res.status(403).json({
      errors: { message: "You do not have permission to export users" },
    });
  }

  const whereClause = {
    AND: [
      {
        OR: [{ name: { contains: search } }, { email: { contains: search } }],
      },
      roles.length > 0 ? { role: { in: roles } } : {}, // Filter by multiple roles
      active !== undefined ? { active } : {},
    ],
  };

  try {
    let users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLogin: true,
      },
      where: whereClause,
      skip: exportToExcel ? undefined : skip, // Skip pagination if exporting to Excel
      take: exportToExcel ? undefined : limit, // Skip limit if exporting to Excel
      orderBy: exportToExcel ? undefined : { [sortBy]: sortOrder }, // Skip sorting if exporting to Excel
    });

    // Replace underscores with spaces in the role field
    users = users.map((user) => ({
      ...user,
      role: user.role.replace(/_/g, " "), // Replace all underscores with spaces
    }));

    if (exportToExcel) {
      // Create a new workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Users");

      // Add headers
      worksheet.columns = [
        { header: "ID", key: "id", width: 10 },
        { header: "Name", key: "name", width: 30 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "role", width: 15 },
        { header: "Active", key: "active", width: 10 },
        { header: "Last Login", key: "lastLogin", width: 20 },
      ];

      // Add rows
      users.forEach((user) => {
        worksheet.addRow({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active ? "Yes" : "No",
          lastLogin: user.lastLogin ? user.lastLogin.toISOString() : "N/A",
        });
      });

      // Set response headers for file download
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");

      // Write the workbook to the response
      await workbook.xlsx.write(res);
      return res.end();
    }

    const totalUsers = await prisma.user.count({
      where: whereClause,
    });
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users,
      page,
      totalPages,
      totalUsers,
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!user) {
      return res.status(404).json({
        errors: { message: "User not found." },
      });
    }
    res.json(user);
  } catch (error) {
    return res.status(500).json({
      errors: { message: "Failed to fetch user", details: error.message },
    });
  }
};

const getCurrentUserProfile = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ errors: { message: 'User ID missing from token payload' } });
    }

    const userId = parseInt(String(req.user.id), 10);

    if (isNaN(userId)) {
      return res.status(400).json({ errors: { message: 'Invalid User ID format in token payload.' } });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        mobile: true, // Include mobile number
        agency: true,
        supervisor: {
          include: {
            agency: {
              select: { id: true, name: true }
            }
          }
        },
      },
    });

    if (!user) {
      return res.status(404).json({ errors: { message: 'User not found' } });
    }

    // Remove password from the user object before sending
    const { password, ...userWithoutPassword } = user;

    let userProfile = {
      id: userWithoutPassword.id,
      role: userWithoutPassword.role,
      email: userWithoutPassword.email,
      name: userWithoutPassword.name,
      mobile: userWithoutPassword.mobile,
      // Add other fields from userWithoutPassword as needed
    };

    if (userWithoutPassword.role === 'AGENCY') {
      if (userWithoutPassword.agency) { // If agency relation is loaded
        userProfile.agencyId = userWithoutPassword.agency.id;
        // You can add more agency details from userWithoutPassword.agency if needed
        // userProfile.agencyName = userWithoutPassword.agency.name;
      } else if (userWithoutPassword.agencyId) { // Fallback if agencyId is a direct field and relation not used/loaded
        userProfile.agencyId = userWithoutPassword.agencyId;
      } else {
        console.warn(`User ${userId} has role AGENCY but no agencyId or agency relation found.`);
        userProfile.agencyId = null;
      }
    }

    if (userWithoutPassword.role === 'SUPERVISOR') {
      if (userWithoutPassword.supervisor) { // If supervisor relation is loaded
        userProfile.supervisor = {
          id: userWithoutPassword.supervisor.id,
          agencyId: userWithoutPassword.supervisor.agencyId,
          agency: userWithoutPassword.supervisor.agency
        };
      } else {
        console.warn(`User ${userId} has role SUPERVISOR but no supervisor relation found.`);
        userProfile.supervisor = null;
      }
    }

    res.json(userProfile);

  } catch (error) {
    console.error('Error in getCurrentUserProfile:', error.message, error.stack);
    // Pass error to the centralized error handler if you have one, or send 500
    next(error); // or res.status(500).json({ errors: { message: 'Server Error while fetching user profile' } });
  }
};

const createUser = async (req, res, next) => {
  // Define Zod schema for user creation
  const schema = z.object({
    name: z
      .string()
      .min(1, "Name cannot be left blank.")
      .max(100, "Name must not exceed 100 characters.")
      .refine((val) => /^[A-Za-z\s\u0900-\u097F]+$/.test(val), {
        message: "Name can only contain letters.",
      }),
    email: z
      .string()
      .email("Email must be a valid email address.")
      .nonempty("Email is required.")
      // async refine on the field itself:
      .refine(
        async (email) => {
          const existing = await prisma.user.findFirst({
            where: { email },
          });
          return !existing;
        },
        {
          message: "A user with this email already exists.",
        }
      ),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters long.")
      .nonempty("Password is required."),
    role: z.enum(Object.values(roles), "Invalid role."),
    active: z.boolean().optional(),
  });

  // Validate the request body using Zod
  const validationErrors = await validateRequest(schema, req.body, res);

  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = await prisma.user.create({
      data: {
        ...req.body,
        password: hashedPassword,
      },
      select: {
        id: true,
        userUniqueId: true,
        createdAt: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    let finalUser = user;
    if (user.role === 'MEMBER' && !user.userUniqueId) {
      const year = new Date(user.createdAt).getFullYear();
      const prefix = `${year}-`;

      for (let attempt = 0; attempt < 3; attempt++) {
        const lastUserThisYear = await prisma.user.findFirst({
          where: {
            userUniqueId: {
              startsWith: prefix,
            },
          },
          select: { userUniqueId: true },
          orderBy: { userUniqueId: 'desc' },
        });

        const lastSeq = lastUserThisYear?.userUniqueId
          ? parseInt(String(lastUserThisYear.userUniqueId).split('-')[1] || '0', 10)
          : 0;

        const nextSeq = lastSeq + 1;
        const generatedUserUniqueId = `${year}-${String(nextSeq).padStart(4, '0')}`;

        try {
          finalUser = await prisma.user.update({
            where: { id: user.id },
            data: { userUniqueId: generatedUserUniqueId },
            select: {
              id: true,
              userUniqueId: true,
              createdAt: true,
              name: true,
              email: true,
              role: true,
              active: true,
            },
          });
          break;
        } catch (e) {
          if (e && e.code === 'P2002') {
            continue;
          }
          throw e;
        }
      }
    }

    res.status(201).json(finalUser);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  // Define Zod schema for user update
  const schema = z
    .object({
      name: z
        .string()
        .min(1, "Name cannot be left blank.") // Ensuring minimum length of 2
        .max(100, "Name must not exceed 100 characters.")
        .refine((val) => /^[A-Za-z\s\u0900-\u097F]+$/.test(val), {
          message: "Name can only contain letters.",
        }),
      email: z
        .string()
        .email("Email must be a valid email address.")
        .optional(),
      role: z.enum(Object.values(roles), "Invalid role."),
      active: z.boolean().optional(),
    })
    .superRefine(async (data, ctx) => {
      const { id } = req.params; // Get the current user's ID from the URL params

      // Check if a user with the same email already exists, excluding the current user
      const existingUser = await prisma.user.findUnique({
        where: {
          email: data.email,
        },
        select: { id: true }, // We only need the id to compare
      });

      // If an existing user is found and it's not the current user
      if (existingUser && existingUser.id !== parseInt(id)) {
        ctx.addIssue({
          path: ["email"],
          message: `User with email ${data.email} already exists.`,
        });
      }
    });

  // Validate the request body using Zod
  const validationErrors = await validateRequest(schema, req.body, res);
  try {
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(updatedUser);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        errors: { message: "User not Found" },
      });
    }
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "User deleted" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        errors: { message: "User not Found" },
      });
    }
    next(error);
  }
};

const setActiveStatus = async (req, res, next) => {
  // Define Zod schema for active status
  const schema = z.object({
    active: z.boolean({
      required_error: "Active status is required.",
      invalid_type_error: "Active status must be a boolean.",
    }),
  });

  // Validate the request body using Zod
  const validationErrors = await validateRequest(schema, req.body, res);
  try {
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: { active: req.body.active },
    });
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  // Define Zod schema for password validation
  const schema = z.object({
    password: z
      .string()
      .min(6, "Password must be at least 6 characters long.")
      .nonempty("Password is required."),
  });

  // Validate the request body using Zod
  const validationErrors = await validateRequest(schema, req.body, res);
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: { password: hashedPassword },
    });
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

const getRoles = async (req, res, next) => {
  try {
    // Get distinct roles that are actually used by users
    const usedRoles = await prisma.user.groupBy({
      by: ['role'],
      where: {
        active: true, // Only consider active users
      },
    });

    // Transform to the same format as before
    const rolesObject = {};
    // Add "All" option first
    rolesObject['ALL'] = 'all';
    
    usedRoles.forEach(({ role }) => {
      // Create a key from the role (e.g., "super_admin" -> "SUPER_ADMIN")
      const key = role.toUpperCase().replace(/ /g, '_');
      rolesObject[key] = role;
    });

    res.json({ roles: rolesObject });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  getCurrentUserProfile,
  createUser,
  updateUser,
  deleteUser,
  setActiveStatus,
  changePassword,
  getRoles,
};
