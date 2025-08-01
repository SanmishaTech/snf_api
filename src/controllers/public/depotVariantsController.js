const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db');

/**
 * @desc    Get depot product variants for a specific product (Public API - No authentication required)
 * @route   GET /api/public/depot-variants/:productId
 * @access  Public
 */
const getPublicDepotVariantsByProduct = asyncHandler(async (req, res) => {
  try {
    const { productId } = req.params;
    const { depotId } = req.query;

    const pId = parseInt(productId, 10);
    if (isNaN(pId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid productId parameter',
      });
    }

    const where = {
      productId: pId,
      notInStock: false,
      isHidden: false,
    };

    // If a depotId is provided, add it to the filter
    if (depotId) {
      const dId = parseInt(depotId, 10);
      if (!isNaN(dId)) {
        where.depotId = dId;
      }
    }

    const variants = await prisma.depotProductVariant.findMany({
      where,
      select: {
        id: true,
        name: true,
        mrp: true,
        minimumQty: true,
        price3Day: true,
        price7Day: true,
        price15Day: true,
        price1Month: true,
        buyOncePrice: true,
        depot: { 
          select: { 
            id: true, 
            name: true,
            isOnline: true,
            address: true
          } 
        },
        product: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    // Transform data for frontend compatibility
    const transformedVariants = variants.map((variant) => ({
      id: variant.id.toString(),
      name: variant.name,
      price: variant.mrp,
      rate: variant.mrp,
      mrp: variant.mrp, // Include MRP explicitly
      buyOncePrice: variant.buyOncePrice,
      price3Day: variant.price3Day,
      price7Day: variant.price7Day,
      price15Day: variant.price15Day,
      price1Month: variant.price1Month,
      minimumQty: variant.minimumQty,
      depot: variant.depot,
      product: variant.product,
      unit: variant.name.includes('500ml') ? '500ml' : variant.name.includes('1L') ? '1L' : 'unit',
      isAvailable: true,
    }));

    res.status(200).json({
      success: true,
      data: transformedVariants,
      total: transformedVariants.length,
    });
  } catch (error) {
    console.error('Error fetching public depot variants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch depot variants',
    });
  }
});

/**
 * @desc    Get all depot variants with pricing for all products (Public API)
 * @route   GET /api/public/depot-variants
 * @access  Public
 */
const getAllPublicDepotVariants = asyncHandler(async (req, res) => {
  try {
    const { depotId, productId } = req.query;

    const where = {
      notInStock: false,
      isHidden: false,
    };

    // Filter by depot if provided
    if (depotId) {
      const dId = parseInt(depotId, 10);
      if (!isNaN(dId)) {
        where.depotId = dId;
      }
    }

    // Filter by product if provided
    if (productId) {
      const pId = parseInt(productId, 10);
      if (!isNaN(pId)) {
        where.productId = pId;
      }
    }

    const variants = await prisma.depotProductVariant.findMany({
      where,
      select: {
        id: true,
        name: true,
        mrp: true,
        minimumQty: true,
        price3Day: true,
        price7Day: true,
        price15Day: true,
        price1Month: true,
        buyOncePrice: true,
        depot: { 
          select: { 
            id: true, 
            name: true,
            isOnline: true,
            address: true
          } 
        },
        product: {
          select: {
            id: true,
            name: true,
            isDairyProduct: true
          }
        }
      },
      orderBy: [
        { depot: { name: 'asc' } },
        { name: 'asc' }
      ],
    });

    // Group variants by depot and product for better organization
    const groupedVariants = variants.reduce((acc, variant) => {
      const depotKey = `depot_${variant.depot.id}`;
      const productKey = `product_${variant.product.id}`;
      
      if (!acc[depotKey]) {
        acc[depotKey] = {
          depot: variant.depot,
          products: {},
        };
      }
      
      if (!acc[depotKey].products[productKey]) {
        acc[depotKey].products[productKey] = {
          product: variant.product,
          variants: [],
        };
      }
      
      acc[depotKey].products[productKey].variants.push({
        id: variant.id.toString(),
        name: variant.name,
        price: variant.mrp,
        rate: variant.mrp,
        buyOncePrice: variant.buyOncePrice,
        price3Day: variant.price3Day,
        price7Day: variant.price7Day,
        price15Day: variant.price15Day,
        price1Month: variant.price1Month,
        minimumQty: variant.minimumQty,
        unit: variant.name.includes('500ml') ? '500ml' : variant.name.includes('1L') ? '1L' : 'unit',
        isAvailable: true,
      });
      
      return acc;
    }, {});

    // Convert grouped data to array format
    const formattedData = Object.values(groupedVariants).map(depotData => ({
      depot: depotData.depot,
      products: Object.values(depotData.products),
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      total: variants.length,
    });
  } catch (error) {
    console.error('Error fetching all public depot variants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch depot variants',
    });
  }
});

/**
 * @desc    Get depot variants by depot ID (Public API)
 * @route   GET /api/public/depots/:depotId/variants
 * @access  Public
 */
const getPublicDepotVariantsByDepot = asyncHandler(async (req, res) => {
  try {
    const { depotId } = req.params;
    const { productId } = req.query;

    const dId = parseInt(depotId, 10);
    if (isNaN(dId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid depotId parameter',
      });
    }

    const where = {
      depotId: dId,
      notInStock: false,
      isHidden: false,
    };

    // Filter by product if provided
    if (productId) {
      const pId = parseInt(productId, 10);
      if (!isNaN(pId)) {
        where.productId = pId;
      }
    }

    const variants = await prisma.depotProductVariant.findMany({
      where,
      select: {
        id: true,
        name: true,
        mrp: true,
        minimumQty: true,
        price3Day: true,
        price7Day: true,
        price15Day: true,
        price1Month: true,
        buyOncePrice: true,
        depot: { 
          select: { 
            id: true, 
            name: true,
            isOnline: true,
            address: true
          } 
        },
        product: {
          select: {
            id: true,
            name: true,
            isDairyProduct: true
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    // Transform data for frontend compatibility
    const transformedVariants = variants.map((variant) => ({
      id: variant.id.toString(),
      name: variant.name,
      price: variant.mrp,
      rate: variant.mrp,
      buyOncePrice: variant.buyOncePrice,
      price3Day: variant.price3Day,
      price7Day: variant.price7Day,
      price15Day: variant.price15Day,
      price1Month: variant.price1Month,
      minimumQty: variant.minimumQty,
      depot: variant.depot,
      product: variant.product,
      unit: variant.name.includes('500ml') ? '500ml' : variant.name.includes('1L') ? '1L' : 'unit',
      isAvailable: true,
    }));

    res.status(200).json({
      success: true,
      data: {
        depot: variants.length > 0 ? variants[0].depot : null,
        variants: transformedVariants,
      },
      total: transformedVariants.length,
    });
  } catch (error) {
    console.error('Error fetching depot variants by depot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch depot variants',
    });
  }
});

module.exports = {
  getPublicDepotVariantsByProduct,
  getAllPublicDepotVariants,
  getPublicDepotVariantsByDepot,
};
