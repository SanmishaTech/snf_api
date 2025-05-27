const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const Validate = require('../utils/validateRequest')
const { z } = require('zod');

const prisma = new PrismaClient();

// Zod schema for product validation
const productSchema = z.object({
  name: z.string().min(1, { message: "Product name is required" }),
  url: z.string().url({ message: 'Invalid URL format' }).optional().nullable(),
  price: z.string().min(1, { message: 'Price is required' }),
  date: z.string().refine((date) => !isNaN(new Date(date).getTime()), { message: 'Invalid date format' }),
  quantity: z.number().int().min(0, { message: 'Quantity must be a non-negative integer' }),
});

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Private/Admin (PRODUCT_CREATE) // Assuming similar access control
 */
const createProduct = asyncHandler(async (req, res, next) => {
  // const validationResult = productSchema.safeParse(req.body);
  const validationerrors = Validate(productSchema, req.body, res)
 

  const { name, url, price, date, quantity } = req.body;

  try {
    const newProduct = await prisma.product.create({
      data: {
        name,
        url,
        price,
        date: new Date(date),
        quantity,
      },
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    // Check for specific Prisma errors if needed, e.g., unique constraint violations
    next(createError(500, 'Failed to create product.'));
  }
});

/**
 * @desc    Get all products
 * @route   GET /api/products
 * @access  Private/Admin (PRODUCT_LIST) // Assuming similar access control
 */
const getAllProducts = asyncHandler(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 10, 
    sortBy = 'createdAt', // Default sort by creation date
    sortOrder = 'desc', 
    search = '' 
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return next(createError(400, 'Invalid page number'));
  }
  if (isNaN(limitNum) || limitNum < 1) {
    return next(createError(400, 'Invalid limit number'));
  }

  const whereConditions = {};
  if (search) {
    // Basic search on URL or price. Adjust as needed.
    whereConditions.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { url: { contains: search, mode: 'insensitive' } },
      { price: { contains: search, mode: 'insensitive' } }, 
    ];
  }

  const validSortByFields = ['name', 'url', 'price', 'date', 'quantity', 'createdAt', 'updatedAt'];
  const orderByField = validSortByFields.includes(sortBy) ? sortBy : 'createdAt';
  const orderByDirection = sortOrder === 'desc' ? 'desc' : 'asc';

  try {
    const products = await prisma.product.findMany({
      where: whereConditions,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: {
        [orderByField]: orderByDirection,
      },
    });

    const totalRecords = await prisma.product.count({
      where: whereConditions,
    });

    const totalPages = Math.ceil(totalRecords / limitNum);

    res.status(200).json({
      data: products,
      totalPages,
      totalRecords,
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    next(createError(500, 'Failed to fetch products'));
  }
});

/**
 * @desc    Get a single product by ID
 * @route   GET /api/products/:id
 * @access  Private (PRODUCT_READ) // Assuming similar access control
 */
const getProductById = asyncHandler(async (req, res, next) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) {
    return next(createError(400, 'Invalid product ID format'));
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    return next(createError(404, `Product with ID ${productId} not found`));
  }

  res.status(200).json(product);
});

/**
 * @desc    Update a product
 * @route   PUT /api/products/:id
 * @access  Private (PRODUCT_UPDATE) // Assuming similar access control
 */
const updateProduct = asyncHandler(async (req, res, next) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) {
    return next(createError(400, 'Invalid product ID format'));
  }

  const validationResult = productSchema.safeParse(req.body);
  if (!validationResult.success) {
    return next(createError(400, {
      message: 'Validation failed',
      errors: validationResult.error.flatten().fieldErrors,
    }));
  }

  const { name, url, price, date, quantity } = validationResult.data;

  try {
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return next(createError(404, `Product with ID ${productId} not found`));
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        name,
        url,
        price,
        date: new Date(date),
        quantity,
      },
    });
    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    // Handle potential Prisma errors like P2025 (Record to update not found)
    if (error.code === 'P2025') {
        return next(createError(404, `Product with ID ${productId} not found during update.`));
    }
    next(createError(500, 'Failed to update product.'));
  }
});

/**
 * @desc    Delete a product
 * @route   DELETE /api/products/:id
 * @access  Private/Admin (PRODUCT_DELETE) // Assuming similar access control
 */
const deleteProduct = asyncHandler(async (req, res, next) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) {
    return next(createError(400, 'Invalid product ID format'));
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return next(createError(404, `Product with ID ${productId} not found`));
    }

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Step 1: Delete OrderItems associated with the product
      await tx.orderItem.deleteMany({
        where: { productId: productId },
      });

      // Step 2: Delete the product itself
      // The initial findUnique check (lines 195-198) already confirms product existence.
      // If it's deleted between that check and this point, delete will gracefully handle it (or Prisma throws P2025).
      await tx.product.delete({
        where: { id: productId },
      });
    });

    res.status(200).json({ message: `Product with ID ${productId} deleted successfully` });
  } catch (error) {
    console.error('Error deleting product:', error);
    // Handle potential Prisma errors like P2025 (Record to delete not found)
    if (error.code === 'P2025') {
        return next(createError(404, `Product with ID ${productId} not found during delete.`));
    }
    next(createError(500, 'Failed to delete product.'));
  }
});

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
