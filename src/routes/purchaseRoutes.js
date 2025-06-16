const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const authMiddleware = require('../middleware/auth');
// Basic auth middleware placeholder – replace with real auth if needed
// const { protect } = require('../middleware/auth');

// router.use(protect);

router.post('/', authMiddleware, purchaseController.createPurchase);
router.get('/', authMiddleware, purchaseController.listPurchases);
router.get('/:id', authMiddleware, purchaseController.getPurchase);
router.put('/:id', authMiddleware, purchaseController.updatePurchase);
router.delete('/:id', authMiddleware, purchaseController.deletePurchase);

module.exports = router;
