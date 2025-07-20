const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Prisma Client
const { DeliveryType } = require('@prisma/client'); // Import DeliveryType enum

/**
 * @desc    Create a new AreaMaster
 * @route   POST /api/admin/areamasters
 * @access  Private/Admin
 */
const createAreaMaster = asyncHandler(async (req, res) => {
  const { name, pincodes, depotId, deliveryType, isDairyProduct } = req.body;

  if (!name || !pincodes || !deliveryType) {
    res.status(400);
    throw new Error('Please provide name, pincodes, and deliveryType');
  }

  if (!Object.values(DeliveryType).includes(deliveryType)) {
    res.status(400);
    throw new Error(`Invalid deliveryType. Must be one of: ${Object.values(DeliveryType).join(', ')}`);
  }

  const data = {
    name,
    pincodes,
    deliveryType,
    isDairyProduct: Boolean(isDairyProduct),
  };

  if (depotId) {
    const parsedDepotId = parseInt(depotId, 10);
    if (isNaN(parsedDepotId)) {
      res.status(400);
      throw new Error('Invalid Depot ID. Must be an integer.');
    }
    data.depotId = parsedDepotId;
  } else {
    data.depotId = null;
  }

  const areaMaster = await prisma.areaMaster.create({
    data,
  });

  res.status(201).json(areaMaster);
});

/**
 * @desc    Get all AreaMasters with pagination, search, and sorting
 * @route   GET /api/admin/areamasters
 * @access  Private/Admin
 */
const getAllAreaMasters = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const sortBy = req.query.sortBy || 'name'; // Default sort by 'name'
  const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

  let orderByClause = {};
  if (sortBy === 'depot.name') {
    orderByClause = { depot: { name: sortOrder } };
  } else {
    // For direct fields on AreaMaster like 'name', 'deliveryType', 'pincodes', 'createdAt'
    orderByClause = { [sortBy]: sortOrder };
  }

  const whereClause = search
    ? {
        OR: [
          { name: { contains: search } },
          { pincodes: { contains: search } },
        ],
      }
    : {};

  const totalRecords = await prisma.areaMaster.count({ where: whereClause });
  const totalPages = Math.ceil(totalRecords / limit);

  if (totalRecords === 0) {
    return res.status(200).json({
      areaMasters: [],
      page,
      totalPages,
      totalRecords,
      message: 'No area masters found matching your criteria.'
    });
  }

  const areaMasters = await prisma.areaMaster.findMany({
    where: whereClause,
    skip: skip,
    take: limit,
    include: {
      depot: {
        select: {
          id: true, // also include id for frontend select value
          name: true,
        },
      },
    },
    orderBy: orderByClause,
  });

  res.status(200).json({
    areaMasters,
    page,
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get a single AreaMaster by ID
 * @route   GET /api/admin/areamasters/:id
 * @access  Private/Admin
 */
const getAreaMasterById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const areaMaster = await prisma.areaMaster.findUnique({
    where: { id: parseInt(id) },
    include: {
      depot: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!areaMaster) {
    res.status(404);
    throw new Error('AreaMaster not found');
  }

  res.status(200).json(areaMaster);
});

/**
 * @desc    Update an AreaMaster
 * @route   PUT /api/admin/areamasters/:id
 * @access  Private/Admin
 */
const updateAreaMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, pincodes, depotId, deliveryType, isDairyProduct } = req.body;

  if (deliveryType && !Object.values(DeliveryType).includes(deliveryType)) {
    res.status(400);
    throw new Error(`Invalid deliveryType. Must be one of: ${Object.values(DeliveryType).join(', ')}`);
  }

  const dataToUpdate = {};

  if (name !== undefined) dataToUpdate.name = name;
  if (pincodes !== undefined) dataToUpdate.pincodes = pincodes;
  if (deliveryType !== undefined) dataToUpdate.deliveryType = deliveryType;
  if (isDairyProduct !== undefined) dataToUpdate.isDairyProduct = Boolean(isDairyProduct);

  if (depotId !== undefined) {
    if (depotId === null || depotId === '') {
      dataToUpdate.depotId = null;
    } else {
      const parsedDepotId = parseInt(depotId, 10);
      if (isNaN(parsedDepotId)) {
        res.status(400);
        throw new Error('Invalid Depot ID. Must be an integer.');
      }
      dataToUpdate.depotId = parsedDepotId;
    }
  }

  try {
    const updatedAreaMaster = await prisma.areaMaster.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
    });
    res.status(200).json(updatedAreaMaster);
  } catch (error) {
    if (error.code === 'P2025') { // Prisma error code for record not found
      res.status(404);
      throw new Error('AreaMaster not found');
    } else {
      res.status(400); // Or 500 for other errors
      throw new Error(error.message || 'Could not update AreaMaster');
    }
  }
});

/**
 * @desc    Delete an AreaMaster
 * @route   DELETE /api/admin/areamasters/:id
 * @access  Private/Admin
 */
const deleteAreaMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.areaMaster.delete({
      where: { id: parseInt(id) },
    });
    res.status(200).json({ message: 'AreaMaster removed successfully' });
  } catch (error) {
    if (error.code === 'P2025') { // Prisma error code for record not found
      res.status(404);
      throw new Error('AreaMaster not found');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not delete AreaMaster');
    }
  }
});

module.exports = {
  createAreaMaster,
  getAllAreaMasters,
  getAreaMasterById,
  updateAreaMaster,
  deleteAreaMaster,
};
