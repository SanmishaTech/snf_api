const asyncHandler = require("express-async-handler");
const createError = require("http-errors");
const { z } = require("zod");
const prisma = require("../../config/db");

// Validation schema for DepotProductVariant (depotId will be taken from logged-in user)
const depotProductVariantSchema = z.object({
  productId: z.coerce
    .number()
    .int()
    .positive({ message: "productId must be a positive integer" }),
  name: z.string().min(1, { message: "name is required" }),
  hsnCode: z.string().optional(),
  mrp: z.coerce
    .number()
    .nonnegative({ message: "MRP must be a non-negative number" }),
  sellingPrice: z.coerce
    .number()
    .nonnegative({ message: "sellingPrice must be a non-negative number" }),
  minimumQty: z.coerce
    .number()
    .int()
    .nonnegative({ message: "minimumQty must be a non-negative integer" }),
  notInStock: z.boolean().optional().default(false),
  isHidden: z.boolean().optional().default(false),
  price3Day: z.coerce.number().nonnegative().optional(),
  price7Day: z.coerce.number().nonnegative().optional(),
  price15Day: z.coerce.number().nonnegative().optional(),
  price1Month: z.coerce.number().nonnegative().optional(),
  buyOncePrice: z.coerce.number().nonnegative().optional(),
});

// For updates we still forbid changing depotId via body; omit depotId field entirely
const depotProductVariantUpdateSchema = depotProductVariantSchema.partial();

module.exports = {
  // Create a new DepotProductVariant
  createDepotProductVariant: asyncHandler(async (req, res, next) => {
    try {
      const { user } = req;
      if (!user?.depotId) {
        return next(
          createError(400, "Logged-in user is not associated with any depot")
        );
      }
      const data = depotProductVariantSchema.parse(req.body);
      const created = await prisma.depotProductVariant.create({
        data: { ...data, depotId: user.depotId },
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }),

  // Get all depot product variants with optional filters and pagination
  getDepotProductVariants: asyncHandler(async (req, res, next) => {
    try {
      const {
        productId,
        depotId: queryDepotId,
        page = 1,
        limit = 1000,
      } = req.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const where = {};
      // ------------------------------
      // Depot filter handling
      // ------------------------------
      if (req.user?.role === "DEPOT_ADMIN" && req.user.depotId) {
        // Depot Admins are tied to their own depot; ignore query param
        where.depotId = req.user.depotId;
      } else if (queryDepotId) {
        const dId = parseInt(queryDepotId, 10);
        if (isNaN(dId))
          return next(createError(400, "Invalid depotId query param"));
        where.depotId = dId;
      }

      // ------------------------------
      // Product filter handling
      // ------------------------------
      if (productId) {
        const pId = parseInt(productId, 10);
        if (isNaN(pId))
          return next(createError(400, "Invalid productId query param"));
        where.productId = pId;
      }

      const [variants, totalRecords] = await prisma.$transaction([
        prisma.depotProductVariant.findMany({
          include: {
            product: true,
            depot: { select: { id: true, name: true } },
          },
          where,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          orderBy: { name: "asc" },
        }),
        prisma.depotProductVariant.count({ where }),
      ]);

      res.json({
        data: variants,
        totalRecords,
        currentPage: pageNum,
        totalPages: Math.ceil(totalRecords / limitNum),
      });
    } catch (error) {
      next(error);
    }
  }),

  // Get a single depot product variant by ID
  getDepotProductVariantById: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, "Invalid id parameter"));

    const variant = await prisma.depotProductVariant.findUnique({
      where: { id },
      include: { product: true, depot: { select: { id: true, name: true } } },
    });
    if (!variant)
      return next(createError(404, "Depot Product Variant not found"));
    res.json(variant);
  }),

  // Get all depot product variants for a specific product
  getDepotProductVariantsByProductId: asyncHandler(async (req, res, next) => {
    const { productId } = req.params;
    const { depotId } = req.query; // Capture depotId from query

    const pId = parseInt(productId, 10);
    if (isNaN(pId)) {
      return next(createError(400, "Invalid productId parameter"));
    }

    const where = {
      productId: pId,
      notInStock: false,
      isHidden: false,
    };

    // If a depotId is provided, add it to the filter
    if (depotId) {
      const dId = parseInt(depotId, 10);
      if (!isNaN(dId)) {
        where.depotId = dId;
      }
    }

    try {
      const variants = await prisma.depotProductVariant.findMany({
        where,
        select: {
          id: true,
          name: true,
          mrp: true,
          minimumQty: true,
          price3Day: true,
          price7Day: true,
          price15Day: true,
          price1Month: true,
          buyOncePrice: true,
          depot: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      });
      console.log(variants);

      // Transform data for frontend compatibility
      const transformedVariants = variants.map((variant) => ({
        id: variant.id.toString(),
        name: variant.name,
        price: variant.mrp, // Map mrp to price
        rate: variant.mrp, // Map mrp to rate
        buyOncePrice: variant.buyOncePrice,
        price3Day: variant.price3Day,
        price7Day: variant.price7Day,
        price15Day: variant.price15Day,
        price1Month: variant.price1Month,
        minimumQty: variant.minimumQty,
        depot: variant.depot,
        isAvailable: true, // Assuming variants returned are available
      }));

      res.json(transformedVariants);
    } catch (error) {
      next(error);
    }
  }),

  // Update a depot product variant
  updateDepotProductVariant: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, "Invalid id parameter"));

    try {
      const data = depotProductVariantUpdateSchema.parse(req.body);
      const updated = await prisma.depotProductVariant.update({
        where: { id },
        data,
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }),

  // Delete a depot product variant
  deleteDepotProductVariant: asyncHandler(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return next(createError(400, "Invalid id parameter"));

    try {
      await prisma.depotProductVariant.delete({ where: { id } });
      res.status(204).end();
    } catch (error) {
      // Prisma foreign key violation (record still referenced elsewhere)
      if (error.code === "P2003") {
        return next(
          createError(
            400,
            "Cannot delete this variant because it is referenced in other records (e.g., purchases or wastage). Remove those references first."
          )
        );
      }
      next(error);
    }
  }),
};