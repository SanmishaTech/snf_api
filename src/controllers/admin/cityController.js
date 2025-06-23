const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db');

/**
 * @desc    Create a new City
 * @route   POST /api/admin/cities
 * @access  Private/Admin
 */
const createCity = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400);
    throw new Error('Please provide a valid city name');
  }

  try {
    const city = await prisma.city.create({
      data: {
        name: name.trim(),
      },
    });
    res.status(201).json(city);
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      res.status(409);
      throw new Error('A city with this name already exists.');
    }
    res.status(500);
    throw new Error('Could not create city. Please try again.');
  }
});

/**
 * @desc    Get all Cities with pagination, search, and sorting
 * @route   GET /api/admin/cities
 * @access  Private/Admin
 */
const getAllCities = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const sortBy = req.query.sortBy || 'name';
  const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

  const whereClause = search ? { name: { contains: search } } : {};

  const totalRecords = await prisma.city.count({
    where: whereClause,
  });
  const totalPages = Math.ceil(totalRecords / limit);

  const cities = await prisma.city.findMany({
    where: whereClause,
    skip: skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  res.status(200).json({
    cities,
    currentPage: page,
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get a single City by ID
 * @route   GET /api/admin/cities/:id
 * @access  Private/Admin
 */
const getCityById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const city = await prisma.city.findUnique({
    where: { id: parseInt(id) },
  });

  if (!city) {
    res.status(404);
    throw new Error('City not found');
  }

  res.status(200).json(city);
});

/**
 * @desc    Update a City
 * @route   PUT /api/admin/cities/:id
 * @access  Private/Admin
 */
const updateCity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const updateData = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400);
      throw new Error('If provided, city name must be valid for update.');
    }
    updateData.name = name.trim();
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400);
    throw new Error('No update data provided.');
  }

  try {
    const updatedCity = await prisma.city.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
    res.status(200).json(updatedCity);
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('City not found');
    } else if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      res.status(409);
      throw new Error('Another city with this name already exists.');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not update city');
    }
  }
});

/**
 * @desc    Delete a City
 * @route   DELETE /api/admin/cities/:id
 * @access  Private/Admin
 */
const deleteCity = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.city.delete({
      where: { id: parseInt(id) },
    });
    res.status(200).json({ message: 'City removed successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('City not found');
    } else {
      res.status(500);
      throw new Error(error.message || 'Could not delete city');
    }
  }
});

module.exports = {
  createCity,
  getAllCities,
  getCityById,
  updateCity,
  deleteCity,
};
