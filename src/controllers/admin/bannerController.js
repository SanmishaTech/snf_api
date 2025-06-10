const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Prisma Client
const path = require('path');

const bannerImageField = 'bannerImage'; // Field name for banner image uploads

/**
 * @desc    Create a new Banner
 * @route   POST /api/admin/banners
 * @access  Private/Admin
 */
const createBanner = asyncHandler(async (req, res) => {
  // 1. Check for upload errors from middleware
  if (req.uploadErrors && Object.keys(req.uploadErrors).length > 0) {
    if (req.files && Object.keys(req.files).length > 0 && req.cleanupUpload) {
      console.log('[Controller createBanner] Upload validation errors detected, ensuring cleanup.');
      await req.cleanupUpload();
    }
    res.status(400).json({
      message: 'File upload failed. Please check errors.',
      errors: req.uploadErrors,
    });
    return;
  }

  const { caption, description, listOrder } = req.body;
  let imagePathForDb = null;

  // 2. Check if image file was uploaded
  if (req.files && req.files[bannerImageField] && req.files[bannerImageField][0]) {
    const uploadedFile = req.files[bannerImageField][0];
    const uuid = req.fileUUID && req.fileUUID[bannerImageField];
    if (!uuid) {
      if (req.cleanupUpload) await req.cleanupUpload();
      res.status(500);
      throw new Error('File uploaded but UUID missing; cleanup performed if possible.');
    }
    imagePathForDb = path.join('/uploads', 'banners', bannerImageField, uuid, uploadedFile.filename).replace(/\\/g, '/');
  } else {
    res.status(400);
    throw new Error('Banner image is required.');
  }

  // 3. Validate listOrder
  if (listOrder === undefined) {
    if (req.cleanupUpload && imagePathForDb) await req.cleanupUpload();
    res.status(400);
    throw new Error('Please provide listOrder');
  }
  const parsedListOrder = Number(listOrder);
  if (isNaN(parsedListOrder) || !Number.isInteger(parsedListOrder)) {
    if (req.cleanupUpload && imagePathForDb) await req.cleanupUpload();
    res.status(400);
    throw new Error('listOrder must be an integer');
  }

  try {
    const banner = await prisma.banner.create({
      data: {
        caption,
        description,
        imagePath: imagePathForDb,
        listOrder: parsedListOrder,
      },
    });
    res.status(201).json(banner);
  } catch (error) {
    if (req.cleanupUpload && imagePathForDb) {
      console.log('[Controller createBanner] DB error after upload, attempting cleanup.');
      await req.cleanupUpload();
    }
    res.status(400);
    throw new Error(error.message || 'Could not create banner');
  }
});

/**
 * @desc    Get all Banners with pagination, search, and sorting
 * @route   GET /api/admin/banners
 * @access  Private/Admin
 */
const getAllBanners = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const sortBy = req.query.sortBy || 'listOrder'; // Default sort by 'listOrder'
  const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

  const orderByClause = { [sortBy]: sortOrder };

  const whereClause = search
    ? {
        OR: [
          { caption: { contains: search, mode: 'insensitive' } }, // mode: 'insensitive' for case-insensitive search if supported by DB
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const totalRecords = await prisma.banner.count({ where: whereClause });
  const totalPages = Math.ceil(totalRecords / limit);

  if (totalRecords === 0 && page === 1) {
    return res.status(200).json({
      banners: [],
      page,
      totalPages,
      totalRecords,
      message: 'No banners found matching your criteria.'
    });
  }

  const banners = await prisma.banner.findMany({
    where: whereClause,
    skip: skip,
    take: limit,
    orderBy: orderByClause,
  });

  res.status(200).json({
    banners,
    page,
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get a single Banner by ID
 * @route   GET /api/admin/banners/:id
 * @access  Private/Admin
 */
const getBannerById = asyncHandler(async (req, res) => {
  const { id } = req.params; // Banner ID is a CUID (string)
  const banner = await prisma.banner.findUnique({
    where: { id },
  });

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  res.status(200).json(banner);
});

/**
 * @desc    Update a Banner
 * @route   PUT /api/admin/banners/:id
 * @access  Private/Admin
 */
const updateBanner = asyncHandler(async (req, res) => {
  // 1. Check for upload errors from middleware
  if (req.uploadErrors && Object.keys(req.uploadErrors).length > 0) {
    if (req.files && Object.keys(req.files).length > 0 && req.cleanupUpload) {
      console.log('[Controller updateBanner] Upload validation errors detected, ensuring cleanup.');
      await req.cleanupUpload();
    }
    res.status(400).json({
      message: 'File upload failed during update. Please check errors.',
      errors: req.uploadErrors,
    });
    return;
  }

  const { id } = req.params;
  const { caption, description, listOrder } = req.body;
  let dataToUpdate = {
    caption,
    description,
  };
  let newImageUploaded = false;

  // 2. Handle listOrder update
  if (listOrder !== undefined) {
    const parsedListOrder = Number(listOrder);
    if (isNaN(parsedListOrder) || !Number.isInteger(parsedListOrder)) {
      if (req.files && req.files[bannerImageField] && req.cleanupUpload) await req.cleanupUpload();
      res.status(400);
      throw new Error('listOrder must be an integer');
    }
    dataToUpdate.listOrder = parsedListOrder;
  }

  // 3. Handle file upload for update
  if (req.files && req.files[bannerImageField] && req.files[bannerImageField][0]) {
    const uploadedFile = req.files[bannerImageField][0];
    const uuid = req.fileUUID && req.fileUUID[bannerImageField];
    if (!uuid) {
      if (req.cleanupUpload) await req.cleanupUpload();
      res.status(500);
      throw new Error('File uploaded for update but UUID missing; cleanup performed if possible.');
    }
    dataToUpdate.imagePath = path.join('/uploads', 'banners', bannerImageField, uuid, uploadedFile.filename).replace(/\\/g, '/');
    newImageUploaded = true;
    // Note: Old image is not deleted from filesystem automatically by this update.
  }

  // Remove undefined fields from dataToUpdate to avoid overwriting with null if not provided
  Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);

  if (Object.keys(dataToUpdate).length === 0) {
    // No actual data fields to update (e.g., only ID was sent, or all body fields were undefined)
    // Check if banner exists, then return it or a 304 Not Modified.
    // For simplicity, we'll let Prisma handle it; it might return the existing record.
    // If you want specific behavior for no-op updates, add it here.
    const existingBanner = await prisma.banner.findUnique({ where: { id } });
    if (!existingBanner) {
        res.status(404); throw new Error('Banner not found');
    }
    return res.status(200).json(existingBanner); // Or 304
  }

  try {
    const updatedBanner = await prisma.banner.update({
      where: { id },
      data: dataToUpdate,
    });
    res.status(200).json(updatedBanner);
  } catch (error) {
    if (req.cleanupUpload && newImageUploaded) {
      console.log('[Controller updateBanner] DB error after new image upload, attempting cleanup of new file.');
      await req.cleanupUpload();
    }
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('Banner not found');
    } else {
      res.status(400);
      throw new Error(error.message || 'Could not update banner');
    }
  }
});

/**
 * @desc    Delete a Banner
 * @route   DELETE /api/admin/banners/:id
 * @access  Private/Admin
 */
const deleteBanner = asyncHandler(async (req, res) => {
  const { id } = req.params; // Banner ID is a CUID (string)

  try {
    await prisma.banner.delete({
      where: { id },
    });
    res.status(200).json({ message: 'Banner removed successfully' });
  } catch (error) {
    if (error.code === 'P2025') { // Prisma error code for record not found
      res.status(404);
      throw new Error('Banner not found');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not delete banner');
    }
  }
});

module.exports = {
  createBanner,
  getAllBanners,
  getBannerById,
  updateBanner,
  deleteBanner,
};
