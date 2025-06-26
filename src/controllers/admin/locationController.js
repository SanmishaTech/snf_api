const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db');

/**
 * @desc    Create a new Location
 * @route   POST /api/admin/locations
 * @access  Private/Admin
 */
const createLocation = asyncHandler(async (req, res) => {
  const { name, cityId, agencyId } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400);
    throw new Error('Please provide a valid location name');
  }

  if (!cityId) {
    res.status(400);
    throw new Error('Please provide a city');
  }

  const data = {
    name: name.trim(),
    cityId: parseInt(cityId),
  };

  if (agencyId) {
    data.agencyId = parseInt(agencyId);
  }

  try {
    const location = await prisma.location.create({
      data,
      include: {
        city: true,
        agency: true,
      },
    });
    res.status(201).json(location);
  } catch (error) {
    res.status(500);
    throw new Error('Could not create location. Please try again.');
  }
});

/**
 * @desc    Get all Locations with pagination, search, and sorting
 * @route   GET /api/admin/locations
 * @access  Private/Admin
 */
const getAllLocations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const sortBy = req.query.sortBy || 'name';
  const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

  const whereClause = search ? { name: { contains: search } } : {};

  const totalRecords = await prisma.location.count({
    where: whereClause,
  });
  const totalPages = Math.ceil(totalRecords / limit);

  const locations = await prisma.location.findMany({
    where: whereClause,
    include: {
      city: true,
      agency: true,
    },
    skip: skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  res.status(200).json({
    locations,
    currentPage: page,
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get a single Location by ID
 * @route   GET /api/admin/locations/:id
 * @access  Private/Admin
 */
const getLocationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const location = await prisma.location.findUnique({
    where: { id: parseInt(id) },
    include: {
      city: true,
      agency: true,
    },
  });

  if (!location) {
    res.status(404);
    throw new Error('Location not found');
  }

  res.status(200).json(location);
});

/**
 * @desc    Update a Location
 * @route   PUT /api/admin/locations/:id
 * @access  Private/Admin
 */
const updateLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, cityId, agencyId } = req.body;

  const updateData = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400);
      throw new Error('If provided, location name must be valid for update.');
    }
    updateData.name = name.trim();
  }

  if (cityId !== undefined) {
    updateData.cityId = parseInt(cityId);
  }

  if (agencyId !== undefined) {
    if (agencyId === null || agencyId === '') {
      updateData.agencyId = null;
    } else {
      updateData.agencyId = parseInt(agencyId);
    }
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400);
    throw new Error('No update data provided.');
  }

  try {
    const updatedLocation = await prisma.location.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        city: true,
        agency: true,
      },
    });

    res.status(200).json(updatedLocation);
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('Location not found');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not update location');
    }
  }
});

/**
 * @desc    Delete a Location
 * @route   DELETE /api/admin/locations/:id
 * @access  Private/Admin
 */
const deleteLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.location.delete({
      where: { id: parseInt(id) },
    });
    res.status(200).json({ message: 'Location removed successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('Location not found');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not delete location');
    }
  }
});

module.exports = {
  createLocation,
  getAllLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
};
