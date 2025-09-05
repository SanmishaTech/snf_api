const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Prisma Client

// Helper function to parse deliverySchedule JSON
const parseDeliverySchedule = (areaMaster) => {
  if (areaMaster.deliverySchedule) {
    try {
      areaMaster.deliverySchedule = JSON.parse(areaMaster.deliverySchedule);
    } catch (error) {
      areaMaster.deliverySchedule = [];
    }
  } else {
    areaMaster.deliverySchedule = [];
  }
  return areaMaster;
};

// Helper function to parse pincodes from various formats
const parsePincodes = (pincodes) => {
  if (!pincodes || pincodes.trim() === '') return [];
  
  // Try to parse as JSON array first
  try {
    const parsed = JSON.parse(pincodes);
    if (Array.isArray(parsed)) {
      return parsed.map(p => String(p).trim()).filter(Boolean);
    }
  } catch {
    // Not JSON, continue with string processing
  }
  
  // Check if it contains commas or other separators
  if (pincodes.includes(',')) {
    return pincodes.split(',').map(p => p.trim()).filter(Boolean);
  } else if (pincodes.includes(';')) {
    return pincodes.split(';').map(p => p.trim()).filter(Boolean);
  } else if (pincodes.includes('|')) {
    return pincodes.split('|').map(p => p.trim()).filter(Boolean);
  } else {
    // Single pincode or space-separated
    const spaceSeparated = pincodes.trim().split(/\s+/);
    if (spaceSeparated.length > 1) {
      return spaceSeparated.filter(Boolean);
    }
    // Single pincode
    return [pincodes.trim()];
  }
};

// Helper function to check if a pincode matches any in the area's pincode list
const doesPincodeMatch = (searchPincode, areaPincodes) => {
  const pincodeList = parsePincodes(areaPincodes);
  return pincodeList.includes(searchPincode);
};

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
        deliverySchedule: true,
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

    // Parse deliverySchedule for all area masters
    const parsedAreaMasters = areaMasters.map(parseDeliverySchedule);

    res.status(200).json({
      success: true,
      data: parsedAreaMasters,
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
    // Find all area masters first, then filter by exact pincode match
    const allAreaMasters = await prisma.areaMaster.findMany({
      select: {
        id: true,
        name: true,
        pincodes: true,
        isDairyProduct: true,
        deliveryType: true,
        deliverySchedule: true,
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

    // Filter area masters that actually serve this pincode
    const areaMasters = allAreaMasters.filter(area => 
      doesPincodeMatch(pincode, area.pincodes)
    );

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

    // Parse deliverySchedule for all area masters
    const parsedAreaMasters = areaMasters.map(parseDeliverySchedule);
    const parsedDairySupportedAreas = dairySupportedAreas.map(parseDeliverySchedule);

    res.status(200).json({
      success: true,
      supported: hasSupport,
      message: hasSupport 
        ? 'Dairy products are available in your area' 
        : 'Dairy products are not currently available in your area',
      areas: parsedAreaMasters,
      dairySupportedAreas: parsedDairySupportedAreas,
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
    // Find all area masters first, then filter by exact pincode match
    const allAreaMasters = await prisma.areaMaster.findMany({
      select: {
        id: true,
        name: true,
        pincodes: true,
        deliveryType: true,
        isDairyProduct: true,
        deliverySchedule: true,
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

    // Filter area masters that actually serve this pincode
    const areaMasters = allAreaMasters.filter(area => 
      doesPincodeMatch(pincode, area.pincodes)
    );

    // Parse deliverySchedule for all area masters
    const parsedAreaMasters = areaMasters.map(parseDeliverySchedule);

    res.status(200).json({
      success: true,
      data: parsedAreaMasters,
      count: parsedAreaMasters.length,
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