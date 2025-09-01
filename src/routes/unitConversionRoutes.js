const express = require('express');
const router = express.Router();
const { roleGuard } = require('../middleware/authorize');

const {
  getDepotVariantsForConversion,
  getProductVariantsInDepot,
  validateConversion,
  performConversion,
  getConversionHistory,
  getConversionSuggestions,
  performBulkConversion
} = require('../controllers/admin/unitConversionController');

// Get depot variants for conversion
router.get(
  '/depot/:depotId/variants',
  roleGuard('ADMIN', 'DepotAdmin'),
  getDepotVariantsForConversion
);

// Get product variants in a specific depot
router.get(
  '/depot/:depotId/product/:productId/variants',
  roleGuard('ADMIN', 'DepotAdmin'),
  getProductVariantsInDepot
);

// Validate conversion before performing
router.post(
  '/validate',
  roleGuard('ADMIN', 'DepotAdmin'),
  validateConversion
);

// Perform unit conversion
router.post(
  '/convert',
  roleGuard('ADMIN', 'DepotAdmin'),
  performConversion
);

// Get conversion history
router.get(
  '/history',
  roleGuard('ADMIN', 'DepotAdmin'),
  getConversionHistory
);

// Get conversion suggestions
router.get(
  '/suggestions/:sourceVariantId',
  roleGuard('ADMIN', 'DepotAdmin'),
  getConversionSuggestions
);

// Perform bulk conversion
router.post(
  '/bulk-convert',
  roleGuard('ADMIN', 'DepotAdmin'),
  performBulkConversion
);

module.exports = router;
