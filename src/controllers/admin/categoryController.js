const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Prisma Client

/**
 * @desc    Create a new Category
 * @route   POST /api/admin/categories
 * @access  Private/Admin
 */
const createCategory = asyncHandler(async (req, res) => {
  // multer populates req.body with text fields and req.file with the uploaded file
  const { name, isDairy } = req.body;
  const imageFile = req.file; // Contains file info if uploaded

  // Log to see what we're getting
  console.log('Received body:', req.body);
  console.log('Received file:', imageFile);

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400);
    throw new Error('Please provide a valid category name');
  }

  // Convert boolean fields (they come as strings from FormData)
  const isDairyBool = typeof isDairy === 'string' ? isDairy.toLowerCase() === 'true' : !!isDairy;

  // Placeholder for image URL - in a real app, save file and get URL
  let imageUrl = null;
  if (imageFile) {
    // imageFile.filename is provided by multer.diskStorage
    imageUrl = `/uploads/categories/${imageFile.filename}`; 
    console.log(`Image saved, public URL: ${imageUrl}`);
  }

  try {
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        isDairy: isDairyBool,
        imageUrl: imageUrl, // This will be null if no image was uploaded
      },
    });
    res.status(201).json(category);
  } catch (error) {
    console.error('Error during category creation:', error); // Log the full error object
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      // Unique constraint failed for name
      res.status(409); // Conflict
      throw new Error('A category with this name already exists.');
    }
    res.status(500);
    throw new Error('Could not create category. Please try again.');
  }
});

/**
 * @desc    Get all Categories with pagination, search, and sorting
 * @route   GET /api/admin/categories
 * @access  Private/Admin
 */
const getAllCategories = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const sortBy = req.query.sortBy || 'name'; // Default sort by name
  const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

  const whereClause = search
    ? {
        name: { contains: search }, // Search by name (now case-sensitive)
      }
    : {};

  const totalRecords = await prisma.category.count({
    where: whereClause,
  });
  const totalPages = Math.ceil(totalRecords / limit);

  const categories = await prisma.category.findMany({
    where: whereClause,
    skip: skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  res.status(200).json({
    categories,
    currentPage: page, // Changed from 'page' to 'currentPage' to match frontend service
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get a single Category by ID
 * @route   GET /api/admin/categories/:id
 * @access  Private/Admin
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await prisma.category.findUnique({
    where: { id: parseInt(id) },
  });

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  res.status(200).json(category);
});

/**
 * @desc    Update a Category
 * @route   PUT /api/admin/categories/:id
 * @access  Private/Admin
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Text fields from FormData are in req.body, file in req.file
  const { name, isDairy, removeImage } = req.body;
  const imageFile = req.file;

  console.log('Update - Received body:', req.body);
  console.log('Update - Received file:', imageFile);

    const updateData = {};

  // Validate and add name if provided
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400);
      throw new Error('If provided, category name must be valid for update.');
    }
    updateData.name = name.trim();
  }

  // Handle boolean fields if provided
  if (isDairy !== undefined) {
    updateData.isDairy = typeof isDairy === 'string' ? isDairy.toLowerCase() === 'true' : !!isDairy;
  }

  // Image handling logic
  if (removeImage === 'true') {
    updateData.imageUrl = null;
    // TODO: Add logic here to delete the old image file from storage if it exists
    console.log(`Image marked for removal for category ID: ${id}`);
  } else if (imageFile) {
    // New image uploaded, use its filename for the public URL
    updateData.imageUrl = `/uploads/categories/${imageFile.filename}`;
    // TODO: Add logic here to delete the old image file from storage if it exists and is different
    console.log(`New image uploaded, public URL: ${updateData.imageUrl}`);
  }
  // If neither removeImage nor a new imageFile is present, existing imageUrl remains unchanged unless explicitly set to null by removeImage.

  if (Object.keys(updateData).length === 0) {
    res.status(400);
    throw new Error('No update data provided.');
  }

  try {
    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
    res.status(200).json(updatedCategory);
  } catch (error) {
    if (error.code === 'P2025') { // Prisma error code for record not found
      res.status(404);
      throw new Error('Category not found');
    } else if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      // Unique constraint failed for name
      res.status(409); // Conflict
      throw new Error('Another category with this name already exists.');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not update category');
    }
  }
});

/**
 * @desc    Delete a Category
 * @route   DELETE /api/admin/categories/:id
 * @access  Private/Admin
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.category.delete({
      where: { id: parseInt(id) },
    });
    res.status(200).json({ message: 'Category removed successfully' });
  } catch (error) {
    if (error.code === 'P2025') { // Prisma error code for record not found
      res.status(404);
      throw new Error('Category not found');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not delete category');
    }
  }
});

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
