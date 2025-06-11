const express = require('express');
const router = express.Router();

const {
  getProductVariants,
  getProductVariantById,
} = require('../controllers/productVariantController');

// NOTE: Attach auth / ACL middleware as required. For now keeping it open similar to product public fetch
// const authMiddleware = require('../middleware/auth');

// GET /api/product-variants
router.get('/', getProductVariants);

// GET /api/product-variants/:id
router.get('/:id', getProductVariantById);

module.exports = router;
