const prisma = require("../config/db");
const bcrypt = require("bcrypt");
const { z } = require("zod");

// Schema for creating a user
const createUserSchema = z.object({
  email: z.string({ required_error: "Email is required." }).email("Invalid email format."),
  password: z.string({ required_error: "Password is required." }).min(8, "Password must be at least 8 characters."),
  name: z.string({ required_error: "Name is required." }).min(1, "Name cannot be empty."),
  depotId: z.string().optional(),
  mobile: z.string().optional().refine(val => !val || /^\d{10}$/.test(val), {
    message: "Mobile number must be 10 digits.",
  }),
  joiningDate: z.coerce.date().optional(),
});

// Schema for updating a user
const updateUserSchema = z.object({
  email: z.string().email("Invalid email format.").optional(),
  password: z.string().min(8, "Password must be at least 8 characters.").optional().or(z.literal('')),
  name: z.string().min(1, "Name cannot be empty.").optional(),
  depotId: z.string().optional().nullable(),
  mobile: z.string().optional().refine(val => !val || /^\d{10}$/.test(val), {
    message: "Mobile number must be 10 digits.",
  }),
  joiningDate: z.coerce.date().optional(),
});

const teamController = {
  updateUser: async (req, res, next) => {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    try {
      const { email, password, name, depotId, mobile, joiningDate } = updateUserSchema.parse(req.body);

      if (email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email: email,
            id: { not: userId },
          },
        });
        if (existingUser) {
          return res.status(409).json({ message: "Email is already in use by another account." });
        }
      }

      const dataToUpdate = {};
      if (name !== undefined) dataToUpdate.name = name;
      if (email !== undefined) dataToUpdate.email = email;
      if (mobile !== undefined) dataToUpdate.mobile = mobile;
      if (joiningDate !== undefined) dataToUpdate.joiningDate = joiningDate;

      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }
      
      if (depotId !== undefined) {
        if (depotId === null) { // Explicitly passed as null to unassign
          dataToUpdate.depot = { disconnect: true };
          dataToUpdate.role = 'ADMIN';
        } else {
          dataToUpdate.depot = { connect: { id: depotId } };
          dataToUpdate.role = 'DepotAdmin';
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
      });

      res.json(user);
    } catch (error) {
      next(error);
    }
  },

  createUser: async (req, res, next) => {
    try {
      const { email, password, name, depotId, mobile, joiningDate } = createUserSchema.parse(req.body);

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(409).json({ message: "A user with this email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          mobile,
          role: depotId ? "DepotAdmin" : "ADMIN",
          depot: depotId ? { connect: { id: depotId } } : undefined,
          joiningDate: joiningDate || new Date(),
        },
      });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  },

  assignDepot: async (req, res, next) => {
    const { userId, depotId } = req.body;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          depot: { connect: { id: depotId } },
                    role: "DepotAdmin",
        },
      });

      res.json(user);
    } catch (error) {
      next(error);
    }
  },

  getUsers: async (req, res, next) => {
    const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      OR: [
        { role: 'ADMIN' },
        { role: 'DepotAdmin' },
      ],
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    try {
      const orderBy = sortBy === 'depot.name'
        ? { depot: { name: sortOrder } }
        : { [sortBy]: sortOrder };

      const [users, totalRecords] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          include: {
            depot: true,
          },
          skip: offset,
          take: parseInt(limit),
          orderBy,
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
      });
    } catch (error) {
      next(error);
    }
  },

  deleteUser: async (req, res, next) => {
        const { id } = req.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID provided.' });
    }
    try {
      await prisma.user.delete({
                where: { id: userId },
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  toggleUserStatus: async (req, res, next) => {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { active: !user.active },
      });

      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = teamController;
