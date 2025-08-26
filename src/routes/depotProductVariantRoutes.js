const express = require('express');
const router = express.Router();
const { roleGuard } = require('../middleware/authorize');

const {
  getDepotProductVariants,
  getDepotProductVariantById,
  getDepotProductVariantsByProductId,
} = require('../controllers/admin/depotProductVariantController');

// Protected: Admin, DepotAdmin and Vendor access
router.get('/', roleGuard('ADMIN', 'DepotAdmin', 'VENDOR'), getDepotProductVariants);
router.get('/:id', roleGuard('ADMIN', 'DepotAdmin', 'VENDOR'), getDepotProductVariantById);

// Public-facing:// This route is available to members to see product variants
router.get(
  '/product/:productId',
  roleGuard('MEMBER', 'ADMIN', 'DepotAdmin'),
  getDepotProductVariantsByProductId
);

module.exports = router;
