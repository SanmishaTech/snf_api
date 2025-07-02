const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db');

/**
 * @desc    Get all Locations (Public API - No authentication required)
 * @route   GET /api/public/locations
 * @access  Public
 */
const getPublicLocations = asyncHandler(async (req, res) => {
  try {
    const locations = await prisma.location.findMany({
      select: {
        id: true,
        name: true,
        cityId: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json({
      success: true,
      data: {
        locations,
        total: locations.length,
      },
    });
  } catch (error) {
    console.error('Error fetching public locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch locations',
    });
  }
});

module.exports = {
  getPublicLocations,
};
