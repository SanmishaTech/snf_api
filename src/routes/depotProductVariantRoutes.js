const express = require('express');
const router = express.Router();

const {
  getDepotProductVariants,
  getDepotProductVariantById,
} = require('../controllers/admin/depotProductVariantController');

// GET /api/depot-product-variants
router.get('/', getDepotProductVariants);

// GET /api/depot-product-variants/:id
router.get('/:id', getDepotProductVariantById);

module.exports = router;
