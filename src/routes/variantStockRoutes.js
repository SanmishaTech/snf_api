const express = require('express');
const router = express.Router();

const {
  createVariantStock,
  getVariantStocks,
  getVariantStockById,
  updateVariantStock,
  deleteVariantStock,
} = require('../controllers/variantStockController');

// TODO: attach auth & ACL middleware as needed
// const authMiddleware = require('../middleware/auth');
// const aclMiddleware = require('../middleware/acl');

router.post('/', /* authMiddleware, */ createVariantStock);
router.get('/', /* authMiddleware, */ getVariantStocks);
router.get('/:id', /* authMiddleware, */ getVariantStockById);
router.put('/:id', /* authMiddleware, */ updateVariantStock);
router.delete('/:id', /* authMiddleware, */ deleteVariantStock);

module.exports = router;
