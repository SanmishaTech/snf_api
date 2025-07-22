const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Prisma Client

/**
 * @desc    Get all AreaMasters for public use (frontend dropdown)
 * @route   GET /api/public/area-masters
 * @access  Public
 */
const getPublicAreaMasters = asyncHandler(async (req, res) => {
  try {
    const areaMasters = await prisma.areaMaster.findMany({
      select: {
        id: true,
        name: true,
        pincodes: true,
        deliveryType: true,
        isDairyProduct: true,
        depot: {
          select: {
            id: true,
            name: true,
            address: true,
            isOnline: true,
            contactPerson: true,
            contactNumber: true,
          },
        },
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
      data: areaMasters,
    });
  } catch (error) {
    console.error('Error fetching public area masters:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch area masters',
    });
  }
});

/**
 * @desc    Validate if an area supports dairy products by pincode
 * @route   GET /api/public/area-masters/validate-dairy/:pincode
 * @access  Public
 */
const validateDairySupport = asyncHandler(async (req, res) => {
  const { pincode } = req.params;

  if (!pincode) {
    res.status(400);
    throw new Error('Pincode is required');
  }

  try {
    // Find area masters that include this pincode
    const areaMasters = await prisma.areaMaster.findMany({
      where: {
        pincodes: {
          contains: pincode,
        },
      },
      select: {
        id: true,
        name: true,
        isDairyProduct: true,
        deliveryType: true,
        depot: {
          select: {
            id: true,
            name: true,
            address: true,
            isOnline: true,
            contactPerson: true,
            contactNumber: true,
          },
        },
      },
    });

    if (areaMasters.length === 0) {
      return res.status(200).json({
        success: true,
        supported: false,
        message: 'No service available in this area',
        areas: [],
      });
    }

    // Check if any area supports dairy products
    const dairySupportedAreas = areaMasters.filter(area => area.isDairyProduct);
    const hasSupport = dairySupportedAreas.length > 0;

    res.status(200).json({
      success: true,
      supported: hasSupport,
      message: hasSupport 
        ? 'Dairy products are available in your area' 
        : 'Dairy products are not currently available in your area',
      areas: areaMasters,
      dairySupportedAreas,
    });
  } catch (error) {
    console.error('Error validating dairy support:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate dairy support',
    });
  }
});

/**
 * @desc    Get area master by pincode
 * @route   GET /api/public/area-masters/by-pincode/:pincode
 * @access  Public
 */
const getAreaMastersByPincode = asyncHandler(async (req, res) => {
  const { pincode } = req.params;

  if (!pincode) {
    res.status(400);
    throw new Error('Pincode is required');
  }

  try {
    const areaMasters = await prisma.areaMaster.findMany({
      where: {
        pincodes: {
          contains: pincode,
        },
      },
      select: {
        id: true,
        name: true,
        pincodes: true,
        deliveryType: true,
        isDairyProduct: true,
        depot: {
          select: {
            id: true,
            name: true,
            address: true,
            isOnline: true,
            contactPerson: true,
            contactNumber: true,
          },
        },
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
      data: areaMasters,
      count: areaMasters.length,
    });
  } catch (error) {
    console.error('Error fetching area masters by pincode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch area masters',
    });
  }
});

module.exports = {
  getPublicAreaMasters,
  validateDairySupport,
  getAreaMastersByPincode,
};