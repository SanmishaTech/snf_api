const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

// All paths are protected by authMiddleware at the app level.
router.get('/', cartController.getCart);
router.post('/sync', cartController.syncCart);
router.post('/items', cartController.addOrUpdateItem);
router.delete('/items/:variantId', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
