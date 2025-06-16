const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const Validate = require('../utils/validateRequest')
const { z } = require('zod');
const validateRequest = require('../utils/validateRequest');

const prisma = new PrismaClient();

// Zod schema for product validation
const productSchema = z.object({
  maintainStock: z.preprocess(
    (val) => typeof val === 'string' ? val === 'true' : Boolean(val),
    z.boolean().default(false)
  ),
  name: z.string().min(1, { message: "Product name is required" }),
  url: z.string().url({ message: 'Invalid URL format' }).optional().nullable(),
  price: z.string().min(1, { message: 'Price is required' }),
  rate: z.string().min(1, { message: 'Rate is required' }), // Added rate
  unit: z.string().optional().nullable(), // Added unit field
  description: z.string().optional().nullable(), // Added description field
  isDairyProduct: z.string().optional().transform(val => val === 'true'), // Added isDairyProduct
  categoryId: z.preprocess(
    (val) => (val ? parseInt(String(val), 10) : null),
    z.number().int().positive().nullable().optional()
  ), // Changed to categoryId
});

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Private/Admin (PRODUCT_CREATE) // Assuming similar access control
 */
const createProduct = asyncHandler(async (req, res, next) => {
  console.log('[ProductController:createProduct] Reached. Body:', req.body, 'Files:', req.files, 'FileUUIDs:', req.fileUUID, 'UploadErrors:', req.uploadErrors);
  try {
    console.log('[ProductController:createProduct] Validating req.body with Zod productSchema.safeParse...');
    const validationResult = productSchema.safeParse(req.body);

    if (!validationResult.success) {
      console.error('[ProductController:createProduct] Zod validation failed for req.body:', validationResult.error.flatten());
      if (typeof req.cleanupUpload === 'function') {
        console.log('[ProductController:createProduct] Triggering cleanup due to Zod validation error.');
        await req.cleanupUpload();
      }
      return res.status(400).json({ 
        message: "Validation failed for request body", 
        errors: validationResult.error.flatten().fieldErrors 
      })
    }
    console.log('[ProductController:createProduct] Zod validation for req.body successful. Validated Data:', validationResult.data);

    console.log('[ProductController:createProduct] Checking for req.uploadErrors...');
    if (req.uploadErrors && Object.keys(req.uploadErrors).length > 0) {
      console.error('[ProductController:createProduct] Upload errors detected from middleware:', req.uploadErrors);
      // Middleware should have handled cleanup if it set req.uploadErrors
      return res.status(400).json({
        message: "File upload error detected by middleware",
        errors: req.uploadErrors,
      });
    }
    console.log('[ProductController:createProduct] No req.uploadErrors found.');

    let attachmentUrl = null;
    console.log('[ProductController:createProduct] Checking for uploaded files (req.files)...');
    if (req.files && req.files.productAttachment && req.files.productAttachment[0]) {
      const file = req.files.productAttachment[0];
      const fileUUID = req.fileUUID && req.fileUUID.productAttachment;
      if (fileUUID) {
        attachmentUrl = `/uploads/products/productAttachment/${fileUUID}/${file.filename}`;
      }
    } else {
      console.log('[ProductController:createProduct] No new file uploaded for productAttachment.');
    }

    const { name, url, price, unit, rate, description, isDairyProduct, categoryId, maintainStock } = validationResult.data;

    const productData = {
      name,
      url,
      attachmentUrl,
      price: parseFloat(price),
      unit,
      rate: parseFloat(rate),
      description, 
      isDairyProduct,
      categoryId,
      maintainStock,
    };

    console.log('[ProductController:createProduct] Attempting to create product with data:', productData);
    const newProduct = await prisma.product.create({
      data: productData,
    });
    console.log('[ProductController:createProduct] Product created successfully:', newProduct);

    res.status(201).json(newProduct);

  } catch (error) {
    console.error("[ProductController:createProduct] Error during product creation:", error);
    // If an error occurs after files have been processed by Multer but before DB commit,
    // and it's not an error caught by middleware's own cleanup (like validation error there),
    // we should attempt cleanup.
    if (typeof req.cleanupUpload === 'function') {
      console.log('[ProductController:createProduct] Triggering cleanup due to error during product creation.');
      await req.cleanupUpload(); 
    }
    // Determine error type for appropriate status code
    if (error.code === 'P2002') { // Prisma unique constraint violation
      return res.status(409).json({ message: 'Product with this name already exists or unique constraint failed.', details: error.meta });
    }
    res.status(500).json({ message: error.message || "Internal Server Error" });
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
    // Basic search on name and URL. Price is Float, so 'contains' is not applicable.
    whereConditions.OR = [
      { name: { contains: search } },
      { url: { contains: search } },
    ];
  }

  const validSortByFields = ['name', 'url', 'price', 'unit', 'rate', 'createdAt', 'updatedAt']; // Added 'unit' and 'rate'
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
      include: {
        category: true, // Include category data
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
 * @desc    Get a limited list of products for public display (e.g., landing page)
 * @route   GET /api/products/public
 * @access  Public
 */
const getPublicProducts = asyncHandler(async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      take: 10, // Limit to 10 products for the landing page
      orderBy: {
        createdAt: 'desc', // Get the latest products
      },
      select: {
        id: true,
        name: true,
        rate: true,
        attachmentUrl: true,
        url: true, // Using 'url' as a proxy for image or product detail link
        unit: true,
      },
    });
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching public products:', error);
    next(createError(500, 'Failed to fetch products for public display'));
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
    include: {
      variants: true, // Include related variants
      category: true, // Also include the category information
    },
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
  const { id } = req.params;
  console.log(`[ProductController:updateProduct ${id}] Reached. Body:`, req.body, 'Files:', req.files);

  const productId = parseInt(id, 10);
  if (isNaN(productId)) {
    if (typeof req.cleanupUpload === 'function') await req.cleanupUpload();
    return next(createError(400, 'Invalid product ID format'));
  }

  try {
    const validationResult = productSchema.safeParse(req.body);
    if (!validationResult.success) {
      if (typeof req.cleanupUpload === 'function') await req.cleanupUpload();
      return res.status(400).json({
        message: "Validation failed",
        errors: validationResult.error.flatten().fieldErrors,
      });
    }

    if (req.uploadErrors && Object.keys(req.uploadErrors).length > 0) {
      return res.status(400).json({
        message: "File upload error",
        errors: req.uploadErrors,
      });
    }

    const { name, url, price, unit, rate, description, isDairyProduct, categoryId, maintainStock } = validationResult.data;

    const updateData = {
      name,
      url,
      price: parseFloat(price),
      unit,
      rate: parseFloat(rate),
      description,
      isDairyProduct,
      categoryId,
      maintainStock,
    };

    console.log(`[ProductController:updateProduct ${id}] Attempting to update product with data:`, updateData);

    if (req.files && req.files.productAttachment && req.files.productAttachment[0]) {
      const file = req.files.productAttachment[0];
      const fileUUID = req.fileUUID && req.fileUUID.productAttachment;
      if (fileUUID) {
        updateData.attachmentUrl = `/uploads/products/productAttachment/${fileUUID}/${file.filename}`;
      }
    } else if (req.body.attachmentUrl === '') {
      // This indicates a request to remove the attachment
      updateData.attachmentUrl = null;
    }

    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      if (typeof req.cleanupUpload === 'function') await req.cleanupUpload();
      return next(createError(404, `Product not found`));
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: updateData,
    });

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error(`[ProductController:updateProduct ${id}] Error:`, error);
    if (typeof req.cleanupUpload === 'function') await req.cleanupUpload();
    if (error.code === 'P2025') {
      return next(createError(404, `Product not found during update.`));
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
    // Prisma error: record not found
    if (error.code === 'P2025') {
      return next(createError(404, `Product with ID ${productId} not found during delete.`));
    }
    // Prisma error: foreign-key constraint violation
    if (error.code === 'P2003') {
      return next(createError(400, 'Cannot delete this product because it is referenced in other records (e.g., variants, purchases, or stock ledgers). Remove or update those references first.'));
    }
    next(createError(500, 'Failed to delete product.'));
  }
});

// Controller to handle bulk update of product variants
const bulkUpdateVariants = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { variants } = req.body; // Expect an array of variant objects

  if (!variants) {
    return res.status(400).json({ message: 'Variants data is required.' });
  }

  const productIdInt = parseInt(productId, 10);
  if (isNaN(productIdInt)) {
    return res.status(400).json({ message: 'Invalid Product ID.' });
  }

  // Use a transaction to ensure atomicity
  const transactionResult = await prisma.$transaction(async (tx) => {
    // Get existing variants from the database for this product
    const existingVariants = await tx.productVariant.findMany({
      where: { productId: productIdInt },
    });

    const existingVariantIds = existingVariants.map(v => v.id);
    const incomingVariantIds = variants.map(v => v.id).filter(id => id != null);

    // 1. Identify variants to delete
    const variantsToDelete = existingVariantIds.filter(id => !incomingVariantIds.includes(id));
    if (variantsToDelete.length > 0) {
      await tx.productVariant.deleteMany({
        where: { id: { in: variantsToDelete } },
      });
    }

    // 2. Identify variants to update and create
    const variantsToUpdate = variants.filter(v => v.id != null && existingVariantIds.includes(v.id));
    const variantsToCreate = variants.filter(v => v.id == null);

    // 3. Perform update operations
    for (const variantData of variantsToUpdate) {
      await tx.productVariant.update({
        where: { id: variantData.id },
        data: {
          name: variantData.name,
          hsnCode: variantData.hsnCode,
          mrp: variantData.mrp,
          sellingPrice: variantData.sellingPrice,
          purchasePrice: variantData.purchasePrice,
          gstRate: variantData.gstRate,
        },
      });
    }

    // 4. Perform create operations
    if (variantsToCreate.length > 0) {
      await tx.productVariant.createMany({
        data: variantsToCreate.map(variantData => ({
          productId: productIdInt,
          name: variantData.name,
          hsnCode: variantData.hsnCode,
          mrp: variantData.mrp,
          sellingPrice: variantData.sellingPrice,
          purchasePrice: variantData.purchasePrice,
          gstRate: variantData.gstRate,
          hsnCode: variantData.hsnCode,
          mrp: variantData.mrp,
          sellingPrice: variantData.sellingPrice,
          purchasePrice: variantData.purchasePrice,
          gstRate: variantData.gstRate,
        })),
      });
    }

    return { message: 'Variants updated successfully.' };
  });

  res.status(200).json(transactionResult);
});

module.exports = {
  createProduct,
  getAllProducts,
  getPublicProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  bulkUpdateVariants,
};

