const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

// Basic auth middleware placeholder – replace with real auth if needed
// const { protect } = require('../middleware/auth');

// router.use(protect);

router.post('/', purchaseController.createPurchase);
router.get('/', purchaseController.listPurchases);
router.get('/:id', purchaseController.getPurchase);
router.put('/:id', purchaseController.updatePurchase);
router.delete('/:id', purchaseController.deletePurchase);

module.exports = router;
